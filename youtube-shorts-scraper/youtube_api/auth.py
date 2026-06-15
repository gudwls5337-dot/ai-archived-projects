from googleapiclient.discovery import build
from config import YOUTUBE_API_KEY


class YouTubeAuth:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or YOUTUBE_API_KEY
        if not self.api_key:
            raise ValueError(
                "YouTube API 키가 필요합니다. \n"
                "1. .env 파일에 YOUTUBE_API_KEY를 설정하거나\n"
                "2. --api-key 옵션으로 전달하세요\n"
                "3. YOUTUBE_API_KEY 환경변수로 설정하세요"
            )

    def build_service(self):
        return build("youtube", "v3", developerKey=self.api_key)
