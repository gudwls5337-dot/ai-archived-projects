from typing import Dict, List
import sys

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
except ImportError:
    print("경고: youtube-transcript-api를 설치하세요: pip install youtube-transcript-api")
    YouTubeTranscriptApi = None


class TranscriptExtractor:
    @staticmethod
    def get_transcript(video_id: str) -> str:
        """
        YouTube 영상의 자막을 추출합니다.

        Args:
            video_id: YouTube 영상 ID

        Returns:
            자막 텍스트 또는 "자막 없음"
        """
        if YouTubeTranscriptApi is None:
            return "자막 없음"

        try:
            # youtube-transcript-api fetch() 메서드
            # FetchedTranscriptSnippet 객체 반환
            api = YouTubeTranscriptApi()
            transcript_list = api.fetch(
                video_id,
                languages=["ko", "en"]
            )

            # FetchedTranscript는 반복 가능 (iterable)
            # 각 아이템은 FetchedTranscriptSnippet 객체
            text_parts = []
            for item in transcript_list:
                # FetchedTranscriptSnippet는 .text 속성 사용
                if hasattr(item, 'text'):
                    text_parts.append(item.text)
                elif isinstance(item, dict):
                    text_parts.append(item.get('text', ''))

            text = " ".join(text_parts)
            return text.strip() if text.strip() else "자막 없음"

        except (TranscriptsDisabled, NoTranscriptFound):
            return "자막 없음"
        except Exception as e:
            # 오류 발생 시에도 "자막 없음"으로 처리
            print(f"자막 추출 오류 ({video_id}): {str(e)}", file=sys.stderr)
            return "자막 없음"

    @staticmethod
    def batch_extract(video_ids: List[str]) -> Dict[str, str]:
        """
        여러 영상의 자막을 한번에 추출합니다.

        Args:
            video_ids: YouTube 영상 ID 리스트

        Returns:
            {video_id: transcript} 딕셔너리
        """
        results = {}
        for i, video_id in enumerate(video_ids, 1):
            print(f"자막 추출 중... {i}/{len(video_ids)}", file=sys.stderr)
            results[video_id] = TranscriptExtractor.get_transcript(video_id)
        return results
