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

## 3. `js/system.js` + `designer/start-designer.php` — PC/Mobile switch drops `elang` / `epage` (FIXED 2026-04-19)

### Finding (Codex QC)

> PC/Mobile 전환 시 현재 편집 중인 페이지와 언어가 유지되지 않습니다.
> `js/system.js:954`의 `switchDevice()`는 `esid`와 `editDevice`만 보내고,
> `designer/start-designer.php:34`와 `:79`에서는 `elang`/`epage`가 없으면
> 기본 언어와 `index.html`로 되돌립니다. 비기본 언어나 서브페이지를
> 편집하다 전환하면 다른 화면으로 튕깁니다.

### Not security, but UX data-loss

If an editor has unsaved work in a non-default language sub-page and hits
the PC↔Mobile toggle, the confirm dialog catches unsaved state only when
`Desinger.modifiedObj` / `dragedorresizedObj` are populated — but once the
user confirms (or there are no dirty flags), the next page load reopens
the default language's `index.html` and the sub-page context is lost.

### Applied patch

**`js/system.js` — send the current language + page along with the switch:**

```js
// + read the live editing state from cookies set by the last editor load
var elang = $.cookie('eLANG') || '';
var epage = $.cookie(esid + '-epage') || '';
var payload = { esid: esid, editDevice: device };
if (elang) payload.elang = elang;
if (epage) payload.epage = epage;
$.ajax({ url: "/designer/start-designer", type: "GET", data: payload, ... });
```

**`designer/start-designer.php` — fall back to session/cookie when the query
param is missing, so older clients and any other navigation path also
retain context:**

```php
if (!empty($_GET['elang'])) {
    $eLANG = trim($_GET['elang']);
} elseif (!empty($_SESSION['eLANG'])) {        // + preserve current lang
    $eLANG = $_SESSION['eLANG'];
} else {
    $eLANG = getDefaultLanguage();
}

// page: query → SID-cookie → session → default
if (isset($_GET['epage']) && $_GET['epage'] !== '') { $ePAGE = $_GET['epage']; }
elseif (!empty($_COOKIE[$_SID.'-epage']))           { $ePAGE = $_COOKIE[$_SID.'-epage']; }
elseif (!empty($_SESSION['ePAGE']))                 { $ePAGE = $_SESSION['ePAGE']; }
else                                                { $ePAGE = 'index.html'; }
```

Result: device switch (and any future caller that omits these params)
keeps the editor on whatever language/page was active.

---

## 4. `member/my-template.php` — pagination 링크 깨짐 (FIXED 2026-04-19)

### Finding (Codex QC)

> 카테고리별 목록에서 pagination 링크가 깨집니다. `member/my-template.php:47`에서
> `alt` 필터일 때 `$parameter = 'alt='.$alt;`로 끝나고, `member/my-template.php:614`에서
> 그대로 `?'.$parameter.'page=...`를 붙여 `?alt=personal/newtemp/pt123page=2` 형태가
> 됩니다. 카테고리 내 템플릿이 100개를 넘으면 2페이지 이상 이동이 안 됩니다.

### Scope larger than reported

The same `$parameter` concatenation pattern is used for `kw`, `ord`, `cid` —
each appends `&key=val`, and the final pagination template is
`?{parameter}page=N`. Without a trailing `&`, the last value runs into
`page=N` for every filter, not just `alt`. The `alt` branch was worse
because it REPLACED `$parameter` (`=`, not `.=`) and its value contains
slashes (URL-corrupting without urlencode).

Also: `$alt` and `$kw` are concatenated directly into a LIKE clause
(`tpfolder like '%$alt%'`) — SQL injection exposure.

### Applied patch

```php
if (!empty($_GET['alt'])) {
    $alt = $_GET['alt'];
    // + .= instead of = so kw/ord/cid aren't wiped when alt is also present
    // + urlencode to survive `/` and other special chars in pagination hrefs
    // + addslashes on the SQL side
    $altEsc = addslashes($alt);
    $parameter .= '&alt='.urlencode($alt);
    $ext_sql .= " and (tpfolder like '%".$altEsc."%') ";
}

// + normalize $parameter to "k=v&k=v&" (no leading '&', trailing '&' if non-empty)
// + so "?{parameter}page=N" renders as "?k=v&page=N" instead of "?k=vpage=N"
$parameter = ltrim($parameter, '&');
if ($parameter !== '' && substr($parameter, -1) !== '&') {
    $parameter .= '&';
}
```

Pagination <a href> templates (`?'.$parameter.'page=N'`) are untouched — the
normalization step makes every existing link render correctly for all
filter combinations.

Still outstanding in this file: `$kw` is also concatenated into SQL
without escaping (line 29). Not in the reported finding; same pattern
applies if addressed later.

---

## 5. `designer/system-header.php` — "사이트 보기" 링크가 항상 PC URL (FIXED 2026-04-19)

### Finding (Codex QC)

> 모바일 편집 모드에서도 상단 "사이트 보기" 링크가 PC URL을 가리킵니다.
> `designer/system-header.php:73`에서 항상 `/{shop}/{lang}/`로만 링크를
> 만들고 `/m/` 분기를 하지 않습니다. 모바일 템플릿 확인 동선에서 잘못된
> 화면을 열게 됩니다.

### URL convention confirmed elsewhere in the tree

- `designer/editor.php:97`: `https://home.{DOMAIN}/{SID}/m/{eLANG}/{ePAGE}`
- `designer/preview.php:42`: `https://home.{DOMAIN}/{SID}/m/{eLANG}/{ePAGE}`
- `lib/function/publisher.php:242`: `/m/` prefix when `$_DEVICE_MODE === 'mobile'`

So the correct shape is `{SID}/m/{lang}/` (the `m` segment sits between
SID and lang, not at the very start).

### Applied patch

```php
$_viewDevice = isset($_SESSION['editDevice']) ? $_SESSION['editDevice'] : 'pc';
$_viewPath   = ($_viewDevice === 'mobile')
    ? ($_SID . '/m/' . $_SESSION['eLANG'] . '/')
    : ($_SID . '/'   . $_SESSION['eLANG'] . '/');
?>
<a href="https://home.<?= $GLOBAL['DOMAIN'] ?>/<?= $_viewPath ?>" target="_blank" class="sys-header-url">
    home.<?= $GLOBAL['DOMAIN'] ?>/<?= $_viewPath ?>
</a>
```

Clicking "사이트 보기" while the editor is in mobile mode now opens the
mobile URL; PC mode keeps the original link. Shares the same session key
(`editDevice`) that the PC/Mobile toggle reads/writes.

---

## 6. Enforcement in current production

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
