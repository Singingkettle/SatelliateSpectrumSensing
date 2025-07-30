# backend/python_backend/routes/simulation_routes.py

from flask import Blueprint, request, jsonify
from services.simulation_service import simulation_service

simulation_bp = Blueprint('simulation_bp', __name__)

@simulation_bp.route('/api/simulation/start', methods=['POST'])
def start_simulation_route():
    """
    启动一个新的仿真任务。
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
              description: "前端仿真的采样周期 (秒)"
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
        description: 仿真成功启动并返回结果
      400:
        description: 请求体无效
      500:
        description: 仿真过程中发生错误
    """
    config = request.get_json()
    if not config:
        return jsonify({"status": "error", "message": "无效的请求体。"}), 400

    # 在这里可以添加更详细的参数验证

    try:
        results = simulation_service.start_simulation(config)
        return jsonify({"status": "success", "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
