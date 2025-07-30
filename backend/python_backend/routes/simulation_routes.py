# backend/python_backend/routes/simulation_routes.py

from flask import Blueprint, request, jsonify
from services.simulation_service import simulation_service

simulation_bp = Blueprint('simulation_bp', __name__)

@simulation_bp.route('/api/simulation/start', methods=['POST'])
def start_simulation_route():
    """
    Starts a new simulation task.
    ---
    tags:
      - Simulation
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [timestamp, samplingPeriod, constellations]
          properties:
            timestamp:
              type: string
              example: "2025-07-15T23:00:00Z"
            samplingPeriod:
              type: number
              description: "Sampling period of the frontend simulation (seconds)"
              example: 0.001
            constellations:
              type: array
              items:
                type: object
                properties:
                  name:
                    type: string
                    example: "Starlink"
                  shell:
                    type: string
                    example: "Shell1"
                  satellites:
                    type: array
                    items:
                      type: object
                      properties:
                        name: { type: string }
                        latitude: { type: number }
                        longitude: { type: number }
                        altitude: { type: number }
                  groundStations:
                    type: array
                    items:
                      type: object
                      properties:
                        name: { type: string }
                        latitude: { type: number }
                        longitude: { type: number }
    responses:
      200:
        description: Simulation started successfully and results are returned
      400:
        description: Invalid request body
      500:
        description: An error occurred during the simulation
    """
    config = request.get_json()
    if not config:
        return jsonify({"status": "error", "message": "Invalid request body."}), 400

    # More detailed parameter validation can be added here

    try:
        results = simulation_service.start_simulation(config)
        return jsonify({"status": "success", "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
