# ⚡ 빠른 참조 가이드

신규 프로젝트를 시작할 때 **이 파일**을 먼저 확인하세요.

---

## 🎯 1단계: 프로젝트 타입 선택

| 타입 | 예시 | 추천 스킬 |
|------|------|---------|
| **Agent/자동화** | agent-hq, Slack bot | ①②③ |
| **웹앱/API** | Next.js, FastAPI | ①② |
| **데이터/분석** | ETL, 리포팅 | ①④ |
| **영상** | 영상 분석, 요약 | ①⑤ |
| **CLI/유틸** | 스크립트, 도구 | ① |

---

## 📌 2단계: 필요 파일만 카피

선택한 스킬의 **README만** 프로젝트로 복제:

```bash
# agent-hq 신규 프로젝트 생성 시
mkdir my-agent-project
cd my-agent-project

# 필요한 README 복제
cp ../../.shared/karpathy-guidelines/README.md ./GUIDELINES.md
cp ../../.shared/superpowers/README.md ./WORKFLOW.md
cp ../../.shared/agentmemory/README.md ./MEMORY.md

# 또는 전체 참조 (선택)
ln -s ../../.shared ./shared
```

---

## 🔍 3단계: 각 스킬의 README 읽기

### ① Karpathy Guidelines
**파일**: `.shared/karpathy-guidelines/README.md`
**읽는 시간**: 5분
**핵심**: 4가지 원칙 (Think → Simple → Surgical → Verify)

```bash
cat .shared/karpathy-guidelines/README.md
```

### ② Superpowers (선택)
**파일**: `.shared/superpowers/README.md`
**읽는 시간**: 10분
**핵심**: Agent 개발 방법론 (Design → Plan → Test → Review)

```bash
cat .shared/superpowers/README.md
```

### ③ agentmemory (Agent 프로젝트만)
**파일**: `.shared/agentmemory/README.md`
**읽는 시간**: 20분 (⚠️ 매우 상세)
**핵심**: Persistent memory system + MCP 통합

```bash
head -200 .shared/agentmemory/README.md  # 처음 200줄만
```

### ④ Understand-Anything (복잡한 코드베이스 분석)
**파일**: `.shared/understand-anything/README.md`
**읽는 시간**: 15분
**핵심**: Knowledge graph visualization

```bash
cat .shared/understand-anything/README.md
```

### ⑤ claude-video (영상 처리)
**파일**: `.shared/claude-video/README.md`
**읽는 시간**: 10분
**핵심**: Video → frames + transcript → Claude

```bash
cat .shared/claude-video/README.md
```

---

## 🚀 4단계: CLAUDE.md 작성

새 프로젝트의 `CLAUDE.md`에 **항상 포함**:

```markdown
# [프로젝트명]

## Coding Principles (Karpathy Guidelines)

1. **Think before coding**
   - 가정을 명시적으로 밝혀라
   - 불확실하면 물어봐라

2. **Simplicity first**
   - 요청받은 것 이상의 기능은 없다
   - 불가능한 시나리오에 대한 에러 처리 없음

3. **Surgical changes**
   - 해당 코드만 수정한다
   - 무관한 코드는 개선하지 않는다

4. **Goal-driven execution**
   - 성공 기준을 정의한다
   - 검증될 때까지 반복한다

## Workflow (Superpowers) [선택사항]

### Agent Development Cycle
Design → Planning → Test-driven Impl → Code Review

## Memory System (agentmemory) [Agent 프로젝트만]

이 프로젝트는 persistent memory system을 사용합니다.
- 자동 context capture 활성화
- MCP 통합: `.shared/agentmemory` 참조
```

---

## 💡 실제 예시

### 예1: Agent 프로젝트 시작
```bash
# 1. 프로젝트 생성
mkdir my-agent
cd my-agent

# 2. CLAUDE.md 작성 (위 템플릿 사용)
cat > CLAUDE.md << 'EOF'
# My Agent

## Coding Principles (Karpathy)
[Karpathy Guidelines 내용 붙여넣기]

## Workflow (Superpowers)
[Superpowers 내용 붙여넣기]

## Memory
agentmemory 활성화 (설정: .shared/agentmemory/README.md 참조)
EOF

# 3. 첫 작업 시작 (가이드라인 따르기)
```

### 예2: 웹앱 프로젝트 시작
```bash
# 1. 프로젝트 생성
mkdir my-webapp
cd my-webapp

# 2. CLAUDE.md에 Karpathy Guidelines만 포함
cat > CLAUDE.md << 'EOF'
# My Web App

## Coding Principles (Karpathy)
[4가지 원칙만]
EOF

# 3. Superpowers 워크플로우는 필요 시에만
```

---

## 📚 추가 리소스

각 스킬의 깃허브 링크:

1. **Karpathy Guidelines**  
   https://github.com/duolahypercho/andrej-karpathy-skills

2. **Superpowers**  
   https://github.com/obra/superpowers

3. **agentmemory**  
   https://github.com/rohitg00/agentmemory

4. **Understand-Anything**  
   https://github.com/Lum1104/Understand-Anything

5. **claude-video**  
   https://github.com/bradautomates/claude-video

---

## ⏱️ 소요 시간

| 작업 | 시간 |
|------|------|
| 프로젝트 타입 선택 | 2분 |
| 필요 파일 카피 | 1분 |
| README 읽기 | 5-20분 |
| CLAUDE.md 작성 | 5분 |
| **합계** | **15-30분** |

---

## ✅ 체크리스트

신규 프로젝트 시작 전:
- [ ] `.shared` 폴더 접근 가능한가?
- [ ] 프로젝트 타입을 선택했는가?
- [ ] 필요 README를 읽었는가?
- [ ] CLAUDE.md를 작성했는가?
- [ ] 첫 작업을 가이드라인 따라 시작했는가?

---

**다음 스텝**: 신규 프로젝트 시작 시 이 가이드를 참조하세요!
