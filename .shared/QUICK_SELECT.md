# 🎯 스킬 선택 매트릭스 (30초 가이드)

**이것만 읽으면 됨**: 프로젝트 타입을 찾고 해당 행을 따라가기

---

## 📊 선택 표

| 프로젝트 타입 | ① Karpathy | ② Superpowers | ③ agentmemory | ④ Understand | ⑤ claude-video | 소요 시간 | 토큰 |
|-------------|:--------:|:----------:|:----------:|:----------:|:----------:|--------|------|
| **🏃 CLI/스크립트** | ✅ | ❌ | ❌ | ❌ | ❌ | 5분 | 250 |
| **🌐 웹앱/API** | ✅ | ⭐ | ❌ | ❌ | ❌ | 10분 | 1.2K |
| **🤖 Agent/자동화** | ✅ | ✅ | ⭐ | ❌ | ❌ | 20분 | 3K |
| **📊 데이터/분석** | ✅ | ❌ | ❌ | ⭐ | ❌ | 15분 | 2K |
| **🎬 영상/멀티미디어** | ✅ | ❌ | ❌ | ❌ | ⭐ | 10분 | 1.5K |
| **🔧 복잡한 시스템** | ✅ | ⭐ | ⭐ | ⭐ | ❌ | 30분 | 5K |

**범례**:
- ✅ = 읽어야 함 (필수)
- ⭐ = 강력히 추천 (읽으세요)
- ❌ = 읽지 말 것 (불필요)
- (빈칸) = 불필요

---

## 🎯 3가지 선택 방식

### 🚀 **가장 빠른 길** (필수만)

**내 프로젝트 타입:**
```
[ ] CLI/스크립트         → ① Karpathy만 (250 토큰)
[ ] 웹앱/API            → ① Karpathy만 (250 토큰)
[ ] 영상/멀티미디어      → ①⑤ (1.5K 토큰)
[ ] 데이터/분석         → ①④ (2K 토큰)
```

**액션**: 해당 README를 `.shared`에서 찾아 읽기

---

### ⭐ **추천 방식** (필수 + 강추)

**내 프로젝트가 복잡하면:**
```
[ ] 웹앱 (복잡)         → ①② (1.2K 토큰)
[ ] Agent             → ①②③ (3K 토큰)
[ ] 복잡한 시스템      → ①②③④ (5K 토큰)
```

**액션**: 해당 README 읽고 CLAUDE.md에 적용

---

### 📚 **깊게 배우기** (모든 것)

**언제**: 혼자 배울 시간이 있을 때
```
모든 5개 스킬 독학
→ .shared/README.md에서 각 스킬 상세 학습
→ 실제 프로젝트에서 테스트
```

---

## 💡 프로젝트별 "딱 필요한 것"

### CLI/유틸 프로젝트 예시
```bash
# 프로젝트 생성
mkdir my-script
cd my-script

# Step 1: 읽을 것 (5분)
cat ../.shared/karpathy-guidelines/README.md

# Step 2: CLAUDE.md 작성 (Karpathy만)
# ...

# Step 3: 작업 시작
```

### Agent 프로젝트 예시
```bash
# 프로젝트 생성
mkdir my-agent
cd my-agent

# Step 1: 읽을 것 (20분)
cat ../.shared/karpathy-guidelines/README.md
cat ../.shared/superpowers/README.md
head -200 ../.shared/agentmemory/README.md  # 처음 200줄만!

# Step 2: CLAUDE.md 작성 (위 3개 내용 포함)
# ...

# Step 3: 작업 시작
```

### 복잡한 레거시 시스템 예시
```bash
# 프로젝트 폴더 진입
cd legacy-system

# Step 1: 읽을 것 (30분)
cat ../.shared/karpathy-guidelines/README.md
cat ../.shared/superpowers/README.md
cat ../.shared/agentmemory/README.md        # 필요하면
cat ../.shared/understand-anything/README.md # 필요하면

# Step 2: CLAUDE.md 업데이트
# ...

# Step 3: Understand-Anything으로 코드베이스 분석
python ../.shared/understand-anything/main.py --codebase .

# Step 4: 작업 시작
```

---

## ⚠️ 토큰 절약 팁

### ❌ 하지 말 것
```
"모든 스킬의 README를 읽자"
→ 14,550 토큰 낭비!
```

### ✅ 할 것
```
1. 위 표에서 내 프로젝트 타입 찾기
2. ✅/⭐ 표시된 것만 읽기
3. 나머지는 무시
```

### 💰 절감액
```
모든 README 읽음:    14,550 토큰
타입별 필수만 읽음:   1,250 토큰
─────────────────
절감:              13,300 토큰 (91% 절감!)
```

---

## 🚨 주의사항

### agentmemory (③)
- **크기**: 86KB (10,000 토큰)
- **필요한 경우**: Agent/다중 자동화 프로젝트만
- **팁**: 전체 README 대신 **처음 200줄 + 설치 섹션**만 읽기

### Understand-Anything (④)
- **크기**: 16KB (2,000 토큰)
- **필요한 경우**: 복잡한 코드베이스 분석만
- **팁**: 필요할 때 찾아 읽기, 미리 읽지 말 것

### Superpowers (②)
- **크기**: 8KB (1,000 토큰)
- **필요한 경우**: 복잡한 프로젝트
- **팁**: 간단한 프로젝트면 건너뛰기

---

## ✅ 체크리스트 (신규 프로젝트 시작)

- [ ] 프로젝트 타입을 결정했다
- [ ] 위 표에서 해당 행을 찾았다
- [ ] ✅/⭐ 표시된 것만 읽기로 결정했다
- [ ] 필요한 README를 읽었다
- [ ] CLAUDE.md에 내용을 적용했다
- [ ] 작업을 시작했다

---

**완료!** 이제 불필요한 파일은 읽지 않습니다. 🚀
