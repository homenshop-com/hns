export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  html: string;
  css: string;
}

export const pageTemplates: PageTemplate[] = [
  {
    id: "blank",
    name: "빈 페이지",
    description: "처음부터 직접 디자인합니다",
    thumbnail: "",
    html: "",
    css: "",
  },
  {
    id: "landing",
    name: "랜딩 페이지",
    description: "서비스/제품 소개에 적합한 원페이지",
    thumbnail: "",
    html: `
      <section class="hero-section">
        <h1>환영합니다</h1>
        <p>당신만의 특별한 공간을 만들어 보세요</p>
        <a href="#features" class="cta-button">자세히 보기</a>
      </section>
      <section id="features" class="features-section">
        <h2>주요 특징</h2>
        <div class="features-grid">
          <div class="feature-card">
            <h3>쉬운 사용</h3>
            <p>누구나 쉽게 사용할 수 있는 직관적인 인터페이스</p>
          </div>
          <div class="feature-card">
            <h3>반응형 디자인</h3>
            <p>모든 기기에서 완벽하게 작동합니다</p>
          </div>
          <div class="feature-card">
            <h3>빠른 속도</h3>
            <p>최적화된 성능으로 빠른 로딩 속도</p>
          </div>
        </div>
      </section>
      <section class="cta-section">
        <h2>지금 시작하세요</h2>
        <p>무료로 시작할 수 있습니다</p>
        <a href="#" class="cta-button">무료 체험</a>
      </section>
      <footer class="footer-section">
        <p>&copy; 2026 회사명. All rights reserved.</p>
      </footer>
    `,
    css: `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Noto Sans KR', sans-serif; color: #333; }
      .hero-section { padding: 120px 20px 80px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
      .hero-section h1 { font-size: 48px; margin-bottom: 16px; font-weight: 700; }
      .hero-section p { font-size: 18px; margin-bottom: 32px; opacity: 0.9; }
      .cta-button { display: inline-block; padding: 14px 32px; background: white; color: #667eea; border-radius: 8px; text-decoration: none; font-weight: 600; transition: transform 0.2s; }
      .cta-button:hover { transform: translateY(-2px); }
      .features-section { padding: 80px 20px; max-width: 1200px; margin: 0 auto; text-align: center; }
      .features-section h2 { font-size: 36px; margin-bottom: 48px; }
      .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
      .feature-card { padding: 40px 24px; border-radius: 12px; background: #f9f9f9; }
      .feature-card h3 { font-size: 20px; margin-bottom: 12px; }
      .feature-card p { color: #666; line-height: 1.6; }
      .cta-section { padding: 80px 20px; text-align: center; background: #f0f0ff; }
      .cta-section h2 { font-size: 32px; margin-bottom: 12px; }
      .cta-section p { font-size: 16px; color: #666; margin-bottom: 24px; }
      .cta-section .cta-button { background: #667eea; color: white; }
      .footer-section { padding: 24px 20px; text-align: center; background: #1a1a1a; color: #999; font-size: 14px; }
      @media (max-width: 768px) { .features-grid { grid-template-columns: 1fr; } .hero-section h1 { font-size: 32px; } }
    `,
  },
  {
    id: "shop",
    name: "쇼핑몰",
    description: "상품 판매에 최적화된 쇼핑몰 레이아웃",
    thumbnail: "",
    html: `
      <header class="shop-header">
        <div class="shop-header-inner">
          <h1 class="shop-logo">SHOP</h1>
          <nav class="shop-nav">
            <a href="#">홈</a>
            <a href="#">신상품</a>
            <a href="#">베스트</a>
            <a href="#">이벤트</a>
          </nav>
        </div>
      </header>
      <section class="shop-banner">
        <h2>SUMMER COLLECTION</h2>
        <p>2026 여름 신상품을 만나보세요</p>
        <a href="#" class="shop-btn">쇼핑하기</a>
      </section>
      <section class="shop-products">
        <h2>인기 상품</h2>
        <div class="products-grid">
          <div class="product-card">
            <div class="product-image">상품 이미지</div>
            <div class="product-info">
              <h3>상품명 A</h3>
              <p class="product-price">₩29,000</p>
            </div>
          </div>
          <div class="product-card">
            <div class="product-image">상품 이미지</div>
            <div class="product-info">
              <h3>상품명 B</h3>
              <p class="product-price">₩39,000</p>
            </div>
          </div>
          <div class="product-card">
            <div class="product-image">상품 이미지</div>
            <div class="product-info">
              <h3>상품명 C</h3>
              <p class="product-price">₩49,000</p>
            </div>
          </div>
          <div class="product-card">
            <div class="product-image">상품 이미지</div>
            <div class="product-info">
              <h3>상품명 D</h3>
              <p class="product-price">₩59,000</p>
            </div>
          </div>
        </div>
      </section>
      <footer class="shop-footer">
        <div class="shop-footer-inner">
          <div class="footer-col">
            <h4>고객센터</h4>
            <p>전화: 02-000-0000<br/>운영시간: 10:00~18:00<br/>점심: 12:00~13:00</p>
          </div>
          <div class="footer-col">
            <h4>계좌안내</h4>
            <p>국민은행 000-00-0000000<br/>예금주: 회사명</p>
          </div>
          <div class="footer-col">
            <h4>회사정보</h4>
            <p>상호: 회사명<br/>대표: 홍길동<br/>사업자등록번호: 000-00-00000</p>
          </div>
        </div>
        <p class="footer-copy">&copy; 2026 SHOP. All rights reserved.</p>
      </footer>
    `,
    css: `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Noto Sans KR', sans-serif; color: #333; }
      .shop-header { background: white; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; }
      .shop-header-inner { max-width: 1200px; margin: 0 auto; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
      .shop-logo { font-size: 24px; font-weight: 800; letter-spacing: 4px; }
      .shop-nav a { margin-left: 24px; text-decoration: none; color: #555; font-size: 15px; }
      .shop-nav a:hover { color: #000; }
      .shop-banner { padding: 100px 20px; text-align: center; background: #f5f0eb; }
      .shop-banner h2 { font-size: 40px; font-weight: 300; letter-spacing: 8px; margin-bottom: 12px; }
      .shop-banner p { font-size: 16px; color: #888; margin-bottom: 28px; }
      .shop-btn { display: inline-block; padding: 14px 40px; background: #222; color: white; text-decoration: none; font-size: 14px; letter-spacing: 2px; }
      .shop-btn:hover { background: #444; }
      .shop-products { padding: 80px 20px; max-width: 1200px; margin: 0 auto; }
      .shop-products h2 { text-align: center; font-size: 28px; margin-bottom: 48px; }
      .products-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
      .product-card { border: 1px solid #eee; overflow: hidden; }
      .product-image { height: 280px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 14px; }
      .product-info { padding: 16px; }
      .product-info h3 { font-size: 15px; margin-bottom: 8px; font-weight: 400; }
      .product-price { font-size: 17px; font-weight: 700; }
      .shop-footer { background: #1a1a1a; color: #999; padding: 48px 20px; }
      .shop-footer-inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
      .footer-col h4 { color: #ccc; margin-bottom: 12px; font-size: 14px; }
      .footer-col p { font-size: 13px; line-height: 1.8; }
      .footer-copy { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #333; font-size: 13px; }
      @media (max-width: 768px) { .products-grid { grid-template-columns: repeat(2, 1fr); } .shop-footer-inner { grid-template-columns: 1fr; } .shop-nav { display: none; } }
    `,
  },
  {
    id: "portfolio",
    name: "포트폴리오",
    description: "작품 및 프로젝트 소개용 갤러리 레이아웃",
    thumbnail: "",
    html: `
      <header class="port-header">
        <h1>포트폴리오</h1>
        <p>디자이너 홍길동</p>
      </header>
      <section class="port-gallery">
        <div class="gallery-item">
          <div class="gallery-img">프로젝트 1</div>
          <h3>프로젝트 제목</h3>
          <p>브랜딩 / 2026</p>
        </div>
        <div class="gallery-item">
          <div class="gallery-img">프로젝트 2</div>
          <h3>프로젝트 제목</h3>
          <p>웹디자인 / 2025</p>
        </div>
        <div class="gallery-item">
          <div class="gallery-img">프로젝트 3</div>
          <h3>프로젝트 제목</h3>
          <p>UI/UX / 2025</p>
        </div>
        <div class="gallery-item">
          <div class="gallery-img">프로젝트 4</div>
          <h3>프로젝트 제목</h3>
          <p>모바일 앱 / 2024</p>
        </div>
        <div class="gallery-item">
          <div class="gallery-img">프로젝트 5</div>
          <h3>프로젝트 제목</h3>
          <p>일러스트 / 2024</p>
        </div>
        <div class="gallery-item">
          <div class="gallery-img">프로젝트 6</div>
          <h3>프로젝트 제목</h3>
          <p>패키지 디자인 / 2024</p>
        </div>
      </section>
      <section class="port-about">
        <h2>About</h2>
        <p>10년 경력의 시각 디자이너입니다. 브랜딩, 웹디자인, UI/UX 분야에서 다양한 프로젝트를 진행하고 있습니다.</p>
      </section>
      <footer class="port-footer">
        <p>contact@example.com</p>
        <p>&copy; 2026 홍길동. All rights reserved.</p>
      </footer>
    `,
    css: `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Noto Sans KR', sans-serif; color: #333; }
      .port-header { padding: 80px 20px; text-align: center; background: #111; color: white; }
      .port-header h1 { font-size: 40px; font-weight: 300; letter-spacing: 6px; margin-bottom: 8px; }
      .port-header p { color: #888; font-size: 16px; }
      .port-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; max-width: 1400px; margin: 40px auto; padding: 0 20px; }
      .gallery-item { text-align: center; }
      .gallery-img { height: 300px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 14px; margin-bottom: 12px; }
      .gallery-item h3 { font-size: 16px; margin-bottom: 4px; }
      .gallery-item p { font-size: 13px; color: #999; margin-bottom: 24px; }
      .port-about { max-width: 700px; margin: 60px auto; padding: 0 20px; text-align: center; }
      .port-about h2 { font-size: 28px; margin-bottom: 16px; }
      .port-about p { line-height: 1.8; color: #555; }
      .port-footer { padding: 32px 20px; text-align: center; background: #111; color: #888; font-size: 13px; }
      .port-footer p { margin-bottom: 4px; }
      @media (max-width: 768px) { .port-gallery { grid-template-columns: repeat(2, 1fr); } .gallery-img { height: 200px; } }
      @media (max-width: 480px) { .port-gallery { grid-template-columns: 1fr; } }
    `,
  },
];
