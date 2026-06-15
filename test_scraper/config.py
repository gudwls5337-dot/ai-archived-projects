import os
from dotenv import load_dotenv

load_dotenv()

# YouTube API Settings
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

# Extraction Settings
MAX_RESULTS_DEFAULT = int(os.getenv("MAX_RESULTS_DEFAULT", 50))
MAX_RESULTS_LIMIT = int(os.getenv("MAX_RESULTS_LIMIT", 200))

# Shorts Characteristics
SHORTS_MAX_DURATION = 60  # seconds
SHORTS_ASPECT_RATIO = "9:16"  # vertical

# Output Settings
OUTPUT_DIR = "data/output"
ALLOWED_FORMATS = ["csv", "json"]
DEFAULT_FORMAT = "csv"

# Sort Options
SORT_OPTIONS = {
    "newest": "publishedAt",
    "popular": "viewCount"
}
