# backend/python_backend/routes/data_routes.py

from flask import Blueprint, jsonify
from services.tle_service import tle_service

data_bp = Blueprint('data_bp', __name__)

@data_bp.route('/api/constellations', methods=['GET'])
def get_supported_constellations():
    """
    获取后端支持的所有卫星星座列表。
    """
    # ... (此函数保持不变)
    supported_constellations = [
        {"name": "Starlink", "description": "..."},
        {"name": "OneWeb", "description": "..."},
        {"name": "Iridium", "description": "..."}
    ]
    return jsonify(supported_constellations)

@data_bp.route('/api/tle/<string:constellation_name>', methods=['GET'])
def get_tle_route(constellation_name: str):
    """
    获取指定星座的TLE数据。
    数据将从Redis缓存中读取，如果缓存不存在则会触发一次下载。
    ---
    tags:
      - TLE Data
    parameters:
      - name: constellation_name
        in: path
        type: string
        required: true
        description: "要获取TLE数据的星座名称 (e.g., starlink)"
    responses:
      200:
        description: 成功返回TLE数据列表
      404:
        description: 不支持的星座名称
      500:
        description: 下载或处理数据时发生错误
    """
    try:
        tle_data = tle_service.get_tle_data(constellation_name)
        return jsonify(tle_data)
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"获取TLE数据时发生内部错误: {e}"}), 500