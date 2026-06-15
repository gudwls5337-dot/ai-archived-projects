// 메인 진입점 — morningRun 파이프라인을 실행합니다
// npm run dev 실행 시 이 파일이 호출됩니다
import { runMorningPipeline } from "./pipelines/morningRun";

runMorningPipeline().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
