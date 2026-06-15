from pydantic import BaseModel
from typing import List
from datetime import datetime


class YoutubeShort(BaseModel):
    video_id: str
    title: str
    duration: int
    views: int
    upload_date: str
    description: str
    hashtags: List[str]
    transcript: str
    url: str

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class ScrapeRequest(BaseModel):
    channel_url: str
    max_results: int = 50
    sort_by: str = "newest"
    output_format: str = "csv"


class ScrapeResponse(BaseModel):
    status: str
    shorts_count: int
    filename: str
    download_url: str
