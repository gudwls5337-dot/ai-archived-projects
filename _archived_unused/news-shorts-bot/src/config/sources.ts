// 수집할 RSS 피드 목록
// 키 없이 바로 사용 가능한 공개 RSS 주소들
export const RSS_SOURCES = [
  {
    name: "한겨레",
    url: "https://www.hani.co.kr/rss/",
  },
  {
    name: "조선일보",
    url: "https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml",
  },
  {
    name: "전자신문 - IT",
    url: "https://rss.etnews.com/Section901.xml",
  },
  {
    name: "아시아경제",
    url: "https://rss.asiae.co.kr/news.htm",
  },
];

// 네이버 뉴스 API로 검색할 키워드 목록
// .env 파일의 SEARCH_KEYWORDS 값이 있으면 그걸 우선 사용
export const DEFAULT_KEYWORDS = ["AI", "인공지능", "테크", "스타트업"];
