import sys
from pathlib import Path

# Add the project root to sys.path so Vercel can locate imports
root_path = Path(__file__).parent.parent
sys.path.append(str(root_path))

# Import the FastAPI application instance
from server import app
