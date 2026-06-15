import re
from typing import List, Dict, Optional
from .auth import YouTubeAuth
from config import SHORTS_MAX_DURATION, MAX_RESULTS_DEFAULT, MAX_RESULTS_LIMIT, SORT_OPTIONS


class YouTubeShortsScraper:
    def __init__(self, api_key: str = None):
        self.auth = YouTubeAuth(api_key)
        self.service = self.auth.build_service()

    @staticmethod
    def get_channel_id(url: str) -> str:
        patterns = [
            r"youtube\.com/@([\w-]+)",
            r"youtube\.com/channel/([\w-]+)",
            r"youtube\.com/c/([\w-]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        raise ValueError(f"Invalid YouTube URL: {url}")

    def get_upload_playlist_id(self, channel_identifier: str) -> str:
        try:
            # Check if it's a channel ID or username
            if channel_identifier.startswith("UC"):
                channel_id = channel_identifier
            else:
                # Search for channel by username
                request = self.service.search().list(
                    q=channel_identifier,
                    part="snippet",
                    type="channel",
                    maxResults=1,
                )
                response = request.execute()
                if not response.get("items"):
                    raise ValueError(f"Channel not found: {channel_identifier}")
                channel_id = response["items"][0]["id"]["channelId"]

            # Get upload playlist ID
            request = self.service.channels().list(
                id=channel_id, part="contentDetails"
            )
            response = request.execute()
            if not response.get("items"):
                raise ValueError(f"Channel not found: {channel_id}")

            return response["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
        except Exception as e:
            raise RuntimeError(f"Failed to get upload playlist: {str(e)}")

    def get_shorts(
        self,
        playlist_id: str,
        max_results: int = MAX_RESULTS_DEFAULT,
        sort_by: str = "newest",
    ) -> List[Dict]:
        if max_results > MAX_RESULTS_LIMIT:
            max_results = MAX_RESULTS_LIMIT
        if sort_by not in SORT_OPTIONS:
            sort_by = "newest"

        try:
            videos = []
            next_page_token = None

            # Fetch playlist items
            while len(videos) < max_results:
                request = self.service.playlistItems().list(
                    playlistId=playlist_id,
                    part="contentDetails",
                    maxResults=min(50, max_results - len(videos)),
                    pageToken=next_page_token,
                )
                response = request.execute()
                items = response.get("items", [])

                if not items:
                    break

                video_ids = [item["contentDetails"]["videoId"] for item in items]

                # Get video details
                details = self._get_video_details(video_ids)
                shorts = self._filter_shorts(details)
                videos.extend(shorts)

                next_page_token = response.get("nextPageToken")
                if not next_page_token or len(videos) >= max_results:
                    break

            # Sort and trim
            videos = videos[:max_results]
            videos = self._sort_shorts(videos, sort_by)

            return videos
        except Exception as e:
            raise RuntimeError(f"Failed to get shorts: {str(e)}")

    def _get_video_details(self, video_ids: List[str]) -> List[Dict]:
        try:
            details = []
            for i in range(0, len(video_ids), 50):  # API limit: 50 videos per request
                batch = video_ids[i : i + 50]
                request = self.service.videos().list(
                    id=",".join(batch),
                    part="snippet,contentDetails,statistics",
                )
                response = request.execute()
                details.extend(response.get("items", []))
            return details
        except Exception as e:
            raise RuntimeError(f"Failed to get video details: {str(e)}")

    @staticmethod
    def _filter_shorts(videos: List[Dict]) -> List[Dict]:
        shorts = []
        for video in videos:
            try:
                snippet = video.get("snippet", {})
                details = video.get("contentDetails", {})
                stats = video.get("statistics", {})

                # Parse duration (ISO 8601 format: PT1M30S -> seconds)
                duration_str = details.get("duration", "PT0S")
                duration_seconds = YouTubeShortsScraper._parse_duration(duration_str)

                # Check if it's a short
                if duration_seconds > SHORTS_MAX_DURATION:
                    continue

                # Extract hashtags from description
                description = snippet.get("description", "")
                hashtags = YouTubeShortsScraper._extract_hashtags(description)

                short = {
                    "video_id": video["id"],
                    "title": snippet.get("title", ""),
                    "description": description,
                    "duration": duration_seconds,
                    "views": int(stats.get("viewCount", 0)),
                    "upload_date": snippet.get("publishedAt", ""),
                    "hashtags": hashtags,
                    "url": f"https://www.youtube.com/shorts/{video['id']}",
                    "transcript": "",  # Will be filled later
                }
                shorts.append(short)
            except Exception:
                continue

        return shorts

    @staticmethod
    def _sort_shorts(shorts: List[Dict], sort_by: str) -> List[Dict]:
        if sort_by == "popular":
            return sorted(shorts, key=lambda x: x["views"], reverse=True)
        else:  # newest
            return sorted(shorts, key=lambda x: x["upload_date"], reverse=True)

    @staticmethod
    def _parse_duration(duration_str: str) -> int:
        pattern = r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"
        match = re.match(pattern, duration_str)
        if not match:
            return 0
        hours, minutes, seconds = match.groups()
        total = (int(hours or 0) * 3600) + (int(minutes or 0) * 60) + int(seconds or 0)
        return total

    @staticmethod
    def _extract_hashtags(text: str) -> List[str]:
        return re.findall(r"#\w+", text)
