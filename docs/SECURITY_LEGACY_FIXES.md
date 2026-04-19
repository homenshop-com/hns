# Legacy PHP Security Fixes

Local-only security patches applied to the legacy PHP source tree
(`/Volumes/DEV/TEST/test/hns/www.homenshop.net/htdocs/…`).

The legacy server (`114.108.148.60`) is currently out of reach (firewalled,
no SSH), and `homenshop.com`'s nginx no longer proxies any dynamic path to
legacy PHP — all `.php` URLs fall through to Next.js, which returns a 302
to `/dashboard` or a 404. So these vulnerabilities are **not exploitable
in production right now**.

This document exists so that:

1. If the legacy tree is ever redeployed or restored from backup, these
   fixes MUST be re-applied. The legacy tree is not in any git repo we
   control, so this file is the only durable record.
2. QC reports against the legacy code have an audit trail.

---

## 1. `member/template/do.php` — `del-template` (FIXED 2026-04-19)

### Finding (Codex QC)

> 템플릿 삭제가 실제 소유자 검증 없이 다른 사용자의 DB 레코드까지 지울 수 있습니다.
> `do.php:474`에서 한 번 email로 조회하지만, 바로 뒤 `do.php:480` 이후 삭제
> 쿼리들은 email 조건이 없습니다. 그래서 `p=personal/newtemp/pt.../wpt...`
> 값을 아는 로그인 사용자가 요청을 만들면, 파일 삭제는 막혀도 workarea,
> template sqlite pages, Templates_HMF, Template_* 메타데이터는 타인 템플릿
> 기준으로 삭제됩니다.

### Confirmed impact

| Statement | Previous scope | Missing owner check |
|---|---|---|
| `SELECT … FROM workarea` | `email` ✓ | — |
| `delsubFolder($t1,$t2,$t3)` (files) | Uses SELECT result → no-op on others | — |
| **`DELETE FROM workarea`** | `tpfolder/tpsubfolder` only | **✗** |
| **`DELETE FROM pages` (SQLite)** | `catname/tpname` only | **✗** |
| **`DELETE FROM Templates_HMF`** | `template_code` only | **✗** |
| **`DELETE FROM Template_Contents/Header/Layer`** | `Template_Code` only | **✗** |
| `removeJSON()` | path only | **✗** |

Also: every `$tpfolder` / `$tpsubfolder` / `$email` was concatenated into
SQL with no escaping — classical SQL-injection exposure (an attacker who
sends `p=a'/* AND 1=0 --/b` could neutralise the WHERE on the DELETE
statements entirely and wipe whole tables).

### Applied patch (conceptual diff)

```php
// + SECURITY: require authenticated caller
if (empty($email)) { echo json(error=not authenticated); exit(0); }

// + SECURITY: strict whitelist (injection + path traversal)
if (!preg_match('#^[A-Za-z0-9/_\-]+$#', $tpfolder) ||
    !preg_match('#^[A-Za-z0-9_\-]+$#',  $tpsubfolder)) {
    echo json(error=invalid path); exit(0);
}

$emailEsc       = addslashes($email);
$tpfolderEsc    = addslashes($tpfolder);
$tpsubfolderEsc = addslashes($tpsubfolder);

// owner verification — remainder only runs when caller owns this template
$result = $db->query("SELECT … FROM workarea
    WHERE email='$emailEsc' AND tpfolder='$tpfolderEsc'
      AND tpsubfolder='$tpsubfolderEsc' AND saved=1")->fetch();
if (!$result || empty($result['tpfolder']) || empty($result['tpsubfolder'])) {
    echo json(error=forbidden); exit(0);
}

// - $query = @$db->query("Delete FROM workarea WHERE tpfolder=… AND tpsubfolder=… …");
// + DELETE is now email-scoped AND uses escaped values
$db->query("DELETE FROM workarea
    WHERE email='$emailEsc' AND tpfolder='$tpfolderEsc'
      AND tpsubfolder='$tpsubfolderEsc' AND saved=1");

// SQLite pages and maindb Template_* deletes still key on template_code /
// (catname,tpname), but are only reached after the SELECT above, so they
// inherit the ownership gate.
```

Result: an unauthenticated request is rejected; an authenticated request
for a template owned by someone else hits the SELECT gate and exits before
any DELETE runs; injection is blocked both by the whitelist and by
`addslashes()` as a second layer.

---

## 2. `member/template/do.php` — `save-template` (NOT YET FIXED)

Scanning the same file surfaced a structurally similar issue in the
`save-template` flow (`do.php` around lines 233–251):

- The `UPDATE workarea … WHERE email='$email' AND …` check IS
  email-scoped (good).
- But the subsequent `UPDATE Templates_HMF SET contents='…'
  WHERE template_code='$tpfolder/$tpsubfolder' AND hmf='h|m|f'`
  statements key only on `template_code`.
- If the `workarea` UPDATE misses because the caller is not the owner,
  the `Templates_HMF` UPDATEs still run and overwrite another user's
  header / menu / footer HTML.

Not in the reported Codex finding. Left unchanged pending separate
decision. If/when the legacy tree is restored, this case should be
patched with the same pattern (owner SELECT gate → exit on mismatch).

---

## 3. Enforcement in current production

Even without legacy, `homenshop.com` is protected because:

```
# /etc/nginx/conf.d/homenshop.conf
# upstream legacy_server {
#     server 114.108.148.60:443;
# }
```

All dynamic paths go to `proxy_pass http://nextjs;`. Next.js middleware
redirects unknown `/*.php` to `/dashboard` (302). Verified on 2026-04-19:

```
$ curl -sI "https://homenshop.com/member/template/do.php?type=del-template&p=x/y"
HTTP/1.1 302 Moved Temporarily
Location: https://homenshop.com/dashboard
```

If nginx is ever reverted to proxy legacy (un-commenting lines 4–5), the
patched `do.php` must also be on disk at the legacy server, or this
vulnerability class comes back.
