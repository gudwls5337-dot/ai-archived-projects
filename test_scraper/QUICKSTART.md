# 빠른 시작 가이드

YouTube 쇼츠 정보 추출 API를 5분 안에 시작하세요!

## 1️⃣ YouTube API 키 발급 (2분)

### 단계별 가이드:

1. **Google Cloud Console 접속**
   - https://console.cloud.google.com/ 방문
   - 구글 계정으로 로그인

2. **새 프로젝트 생성**
   - 상단의 프로젝트 선택 > "새 프로젝트"
   - 프로젝트명: "YouTube Shorts Scraper" (또는 임의)
   - "만들기" 클릭

3. **YouTube Data API 활성화**
   - 좌측 메뉴 > "API 및 서비스" > "라이브러리"
   - 검색: "YouTube Data API v3"
   - 클릭 후 "사용" 버튼

4. **API 키 생성**
   - 좌측 메뉴 > "API 및 서비스" > "사용자 인증 정보"
   - "사용자 인증 정보 만들기" > "API 키"
   - 생성된 API 키 복사

## 2️⃣ 프로젝트 설정 (2분)

```bash
# 1. .env 파일 생성
cd youtube-shorts-scraper
cp .env.example .env

# 2. .env 파일 편집 (메모장 또는 IDE)
# YOUTUBE_API_KEY=your_api_key_here 에서
# your_api_key_here 를 위에서 복사한 API 키로 변경
```

**Windows에서 .env 파일 편집:**
```powershell
# PowerShell에서
notepad .env

# 또는 VS Code
code .env
```

## 3️⃣ 서버 실행 (1분)

```bash
python main.py
```

또는:
```bash
uvicorn main:app --reload
```

출력 예시:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete
```

## 4️⃣ 테스트 (1-2분)

### 브라우저에서:
1. http://localhost:8000/docs 방문
2. `POST /scrape` 엔드포인트 확장
3. "Try it out" 클릭
4. 다음과 같이 입력:

```json
{
  "channel_url": "https://www.youtube.com/@MrBeast",
  "max_results": 10,
  "sort_by": "newest",
  "output_format": "csv"
}
```

5. "Execute" 클릭
6. 응답에서 `download_url` 복사

### 또는 Terminal/CMD에서:

```bash
curl -X POST "http://localhost:8000/scrape" \
  -H "Content-Type: application/json" \
  -d "{\"channel_url\": \"https://www.youtube.com/@MrBeast\", \"max_results\": 10}"
```

## 🎯 주요 채널 테스트

추천하는 테스트 채널들:

| 채널 | URL | 특징 |
|------|-----|------|
| MrBeast | https://www.youtube.com/@MrBeast | 인기 많음 |
| TED | https://www.youtube.com/@TED | 교육 콘텐츠 |
| NASA | https://www.youtube.com/@NASA | 과학 콘텐츠 |
| CodeAsArt | https://www.youtube.com/@CodeAsArt | 개발자 채널 |

## ⚡ 빠른 팁

### 1. 로컬 테스트
```bash
# 작은 데이터로 빠르게 테스트
curl -X POST "http://localhost:8000/scrape" \
  -H "Content-Type: application/json" \
  -d '{"channel_url": "https://www.youtube.com/@MrBeast", "max_results": 5}'
```

### 2. 여러 채널 처리
```python
# test_batch.py
import requests

channels = [
    "https://www.youtube.com/@MrBeast",
    "https://www.youtube.com/@TED",
]

for url in channels:
    resp = requests.post("http://localhost:8000/scrape", json={"channel_url": url})
    print(resp.json())
```

### 3. 결과 파일 다운로드
```bash
# 생성된 파일 다운로드
curl "http://localhost:8000/download/MrBeast_shorts_newest_2026-06-10.csv" \
  -o my_shorts.csv

# Excel에서 열기 (Windows)
start my_shorts.csv
```

## 🔧 문제 해결

### 1. "YOUTUBE_API_KEY not found" 오류

✅ **해결책:**
```bash
# 1. .env 파일이 프로젝트 루트에 있는지 확인
ls -la .env  # 또는 dir .env (Windows)

# 2. .env 파일 내용 확인
cat .env  # 또는 type .env (Windows)

# 3. 올바른 API 키가 입력되었는지 확인
# YOUTUBE_API_KEY=xxxxxxxxxxxxxxxx 형태여야 함
```

### 2. "Channel not found" 오류

✅ **해결책:**
- 채널 URL 형식 확인: `https://www.youtube.com/@channelname`
- `@` 기호가 포함되어 있는지 확인
- 띄어쓰기가 없는지 확인

### 3. "No shorts found" 오류

✅ **해결책:**
- 해당 채널이 쇼츠를 업로드했는지 확인
- 채널 페이지 방문 → "쇼츠" 탭 확인

### 4. 포트 8000이 이미 사용 중

✅ **해결책:**
```bash
# 다른 포트 사용
uvicorn main:app --port 8001
```

## 📊 데이터 분석 예제

생성된 CSV를 분석하려면:

```python
import pandas as pd

# CSV 로드
df = pd.read_csv('MrBeast_shorts_newest_2026-06-10.csv')

# 조회수 상위 10개
print(df.nlargest(10, 'views')[['title', 'views']])

# 통계
print(f"총 쇼츠: {len(df)}")
print(f"평균 조회수: {df['views'].mean():,.0f}")
print(f"최대 조회수: {df['views'].max():,.0f}")
```

## 📚 다음 단계

1. **더 많은 채널 추출**: 여러 채널 데이터 수집
2. **데이터 분석**: 추출한 데이터를 분석
3. **웹 UI 추가**: 브라우저에서 편하게 사용
4. **정기 업데이트**: 스케줄러로 자동 업데이트

## 🆘 추가 도움

- **API 문서**: http://localhost:8000/docs (서버 실행 중)
- **README.md**: 자세한 설명 참고
- **Google Cloud Console**: https://console.cloud.google.com/
- **YouTube API 문서**: https://developers.google.com/youtube/v3

---

**축하합니다! 이제 준비가 완료되었습니다! 🎉**
