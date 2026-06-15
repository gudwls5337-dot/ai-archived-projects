from typing import Dict, List
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound


class TranscriptExtractor:
    @staticmethod
    def get_transcript(video_id: str) -> str:
        try:
            transcript = YouTubeTranscriptApi.get_transcript(
                video_id, languages=["ko", "en"]
            )
            text = " ".join([item["text"] for item in transcript])
            return text
        except (TranscriptsDisabled, NoTranscriptFound):
            return "자막 없음"
        except Exception as e:
            return f"오류: {str(e)}"

    @staticmethod
    def batch_extract(video_ids: List[str]) -> Dict[str, str]:
        results = {}
        for video_id in video_ids:
            results[video_id] = TranscriptExtractor.get_transcript(video_id)
        return results
