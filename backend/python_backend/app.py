# backend/python_backend/app.py

from flask import Flask, jsonify
from flask_cors import CORS

# Import route blueprints
from routes.data_routes import data_bp
from routes.simulation_routes import simulation_bp

# Import and initialize the background scheduler
from services.scheduler_service import initialize_scheduler

# Initialize Flask application
app = Flask(__name__)
# Enable CORS, allowing cross-origin requests from all sources
CORS(app)

# Register blueprints
app.register_blueprint(data_bp)
app.register_blueprint(simulation_bp)


@app.route("/api/health", methods=["GET"])
def health_check():
    """
    Health check endpoint
    """
    return jsonify({"status": "ok", "message": "Backend is running"})


if __name__ == "__main__":
    # Start the background scheduler
    initialize_scheduler()
    # Start the Flask development server
    print("Hello")
    app.run(host="0.0.0.0", port=6359, debug=False, use_reloader=False)
