# 🎯 AI 개발 공용 스킬 라이브러리

이 폴더는 **새로운 프로젝트를 시작할 때 꺼내 쓸 수 있는 검증된 스킬과 방법론 모음**입니다.

> **사용 원칙**: 현재 프로젝트에는 적용되지 않습니다. 향후 신규 프로젝트 시작 시 필요한 것만 참조하세요.

---

## 📚 스킬 목록 (5가지)

### 1️⃣ **Karpathy Guidelines** 
**`./karpathy-guidelines`**

**목적**: AI 코딩 에이전트를 위한 핵심 원칙
- Think before coding (가정 명확화)
- Keep it simple (불필요한 복잡성 제거)
- Make surgical changes (해당 코드만 수정)
- Define and verify (성공 기준 명확화)

**사용처**:
- ✅ 모든 프로젝트의 CLAUDE.md에 기본으로 포함
- ✅ Agent 품질 향상
- 📄 활용 파일: `README.md`, `guidelines.md`

**도움될 프로젝트**:
- agent-hq (agent 코드 생성 품질)
- msds-translator (구현 전 가정 명확화)
- 신규 프로젝트 (standard guidelines)

---

### 2️⃣ **Superpowers**
**`./superpowers`**

**목적**: AI 코딩 에이전트를 위한 완전한 개발 방법론
- Design refinement & planning
- Test-driven implementation (red-green-refactor)
- Code review workflow
- Multi-agent orchestration

**사용처**:
- ✅ 복잡한 에이전트 시스템 (agent-hq 같은 프로젝트)
- ✅ 구조화된 개발 workflow 필요 시
- 📄 활용 파일: 문서화된 workflow, 예제

**도움될 프로젝트**:
- agent-hq (agent workflow 구조화)
- 신규 multi-agent 프로젝트

---

### 3️⃣ **agentmemory**
**`./agentmemory`**

**목적**: AI 에이전트용 persistent memory system
- 자동 context capture (12개 lifecycle hooks)
- Hybrid search (BM25 + semantic + knowledge graph)
- 4-tier memory system (working → episodic → semantic → procedural)
- **토큰 사용량 92% 감소**

**사용처**:
- ✅ 다중 agent 시스템에서 context 재사용
- ✅ API 비용 절감 (토큰 92% 감소)
- ✅ 장기 프로젝트에서 일관성 유지
- 📄 활용: MCP 통합, REST API, 53개 specialized tools

**도움될 프로젝트**:
- agent-hq (agent 간 memory 공유)
- 신규 장기 자동화 프로젝트

**설치**:
```bash
cd understand-anything
pip install -r requirements.txt
# MCP 설정 또는 REST API로 통합
```

---

### 4️⃣ **Understand-Anything**
**`./understand-anything`**

**목적**: 코드베이스를 interactive knowledge graph로 변환
- 구조 분석 (Tree-sitter)
- Semantic understanding (LLM)
- Interactive visualization (nodes & relationships)
- 자동 dependency 분석
- Change impact analysis

**사용처**:
- ✅ 큰 레거시 시스템 분석/온보딩
- ✅ 코드베이스 구조 이해 필요 시
- ✅ 새 팀원 온보딩 (자동 다큐멘테이션)
- 📄 활용: Dashboard, search, tours

**도움될 프로젝트**:
- agent-hq (agent 시스템 복잡도 시각화)
- 신규 복잡한 프로젝트 (초기 분석)

**설치**:
```bash
cd understand-anything
pip install -r requirements.txt
python main.py --codebase <target_path>
```

---

### 5️⃣ **claude-video**
**`./claude-video`**

**목적**: Claude가 비디오를 분석할 수 있도록 확장
- 비디오 다운로드 (YouTube, TikTok, Vimeo 등)
- 프레임 추출 (지능형 샘플링)
- 자막 추출 (native 또는 Whisper API)
- Claude에 통합 (frames + transcript)

**사용처**:
- ✅ 영상 콘텐츠 분석 필요 시
- ✅ YouTube 콘텐츠 요약/분류
- ✅ 영상 기반 레포트 생성
- 📄 활용: /watch 스킬 형태로 Claude Code 통합

**도움될 프로젝트**:
- 마케팅/콘텐츠 분석 프로젝트
- 영상 기반 자동화 프로젝트

**설치**:
```bash
cd claude-video
# Claude Code 스킬로 설치하거나
# 독립 실행 모드로 사용
```

---

## 🎯 프로젝트 타입별 선택 가이드

### Agent/자동화 프로젝트
```
필수: Karpathy Guidelines + Superpowers + agentmemory
선택: Understand-Anything (복잡할 때)
```

### 웹앱/API 개발
```
필수: Karpathy Guidelines
선택: Superpowers (복잡한 비즈니스 로직)
```

### 데이터/분석 프로젝트
```
필수: Karpathy Guidelines
강추: Understand-Anything (데이터 구조 분석)
선택: agentmemory (long-running batch)
```

### 영상/멀티미디어 프로젝트
```
필수: claude-video + Karpathy Guidelines
선택: agentmemory (batch 처리)
```

### 작은 CLI/유틸리티
```
필수: Karpathy Guidelines
선택: 나머지는 불필요
```

---

## 📖 신규 프로젝트 시작 체크리스트

**Step 1: 프로젝트 타입 판단**
- [ ] Agent/자동화인가?
- [ ] 웹앱/API인가?
- [ ] 데이터/분석인가?
- [ ] 영상/멀티미디어인가?
- [ ] 기타 CLI/유틸리티인가?

**Step 2: 필요한 스킬 선택**
- [ ] 위 가이드 참조해서 필수/선택 스킬 선정

**Step 3: 통합**
- [ ] `.shared/<skill_name>` 참조 설정
- [ ] 프로젝트의 CLAUDE.md에 가이드라인 포함
- [ ] 필요 시 환경 설정/의존성 설치

**Step 4: 검증**
- [ ] 첫 작업을 선택한 스킬 원칙 따라 진행
- [ ] 피드백 수집

---

## 📊 저장소 크기 (2026-06-09)

| 스킬 | 크기 | 설명 |
|-----|------|------|
| agentmemory | 33.5 MB | 가장 무거움 (Python 전체 구현) |
| understand-anything | 25.7 MB | LLM 기반 분석 도구 |
| superpowers | 0.9 MB | 문서 + 워크플로우 |
| claude-video | 0.1 MB | 매우 경량 |
| karpathy-guidelines | ~0.05 MB | 문서 가이드라인 |
| **합계** | **~60 MB** | 신규 프로젝트에서 선택적 복제 가능 |

---

## 🚀 사용 예시

### 예1: 신규 agent 프로젝트
```bash
# agent-v2 프로젝트 생성
mkdir agent-v2
cd agent-v2

# CLAUDE.md 작성 시 참조
cat ../.shared/karpathy-guidelines/README.md
cat ../.shared/superpowers/README.md

# agentmemory 통합
# - .shared/agentmemory의 MCP 설정 참조
# - 또는 독립 REST API 구성
```

### 예2: 레거시 코드 분석
```bash
# Understand-Anything 실행
cd .shared/understand-anything
python main.py --codebase ../../msds-translator
# → interactive 대시보드 생성
```

### 예3: 영상 처리 프로젝트
```bash
# claude-video 스킬 설정
# Claude Code에서 /watch 명령 사용
# .shared/claude-video 구성 참조
```

---

## 📝 유지보수

### 버전 업그레이드
```bash
# 각 폴더에서 정기적으로 (분기마다)
cd .shared/agentmemory
git pull origin main

cd ../understand-anything
git pull origin main
# ... 다른 폴더들
```

### 새 스킬 추가
향후 유용한 도구를 발견하면:
```bash
cd .shared
git clone <new-skill-repo>
# README.md 업데이트
```

---

## ⚠️ 주의사항

1. **현재 프로젝트에 적용하지 마세요**
   - agent-hq, msds-translator 등은 현재 상태 유지
   - 신규 프로젝트에서만 사용

2. **각 스킬의 라이선스 확인**
   - MIT, Apache, GPL 등 다양한 라이선스
   - 상용 프로젝트에서 사용 시 라이선스 준수

3. **의존성 관리**
   - 각 스킬이 고유의 Python/Node/기타 의존성 보유
   - 프로젝트별로 선택적으로 설치

4. **성숙도 확인**
   - agentmemory: ⭐⭐⭐ (완성도 높음)
   - understand-anything: ⭐⭐⭐ (안정적)
   - superpowers: ⭐⭐⭐ (검증됨)
   - claude-video: ⭐⭐⭐ (실무용)
   - karpathy-guidelines: ⭐⭐⭐ (표준)

---

**마지막 업데이트**: 2026-06-09
**라이브러리 완성도**: ✅ 5/5 스킬 클론 완료
**다음 액션**: 신규 프로젝트 시작 시 필요한 스킬 참조
