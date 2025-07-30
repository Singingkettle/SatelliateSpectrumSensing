# backend/python_backend/app.py

from flask import Flask, jsonify
from flask_cors import CORS

# 导入路由蓝图
from routes.data_routes import data_bp
from routes.simulation_routes import simulation_bp

# 导入并初始化后台调度器
from services.scheduler_service import initialize_scheduler

# 初始化Flask应用
app = Flask(__name__)
# 启用CORS，允许所有来源的跨域请求
CORS(app)

# 注册蓝图
app.register_blueprint(data_bp)
app.register_blueprint(simulation_bp)


@app.route("/api/health", methods=["GET"])
def health_check():
    """
    健康检查接口
    """
    return jsonify({"status": "ok", "message": "Backend is running"})


if __name__ == "__main__":
    # 启动后台调度器
    initialize_scheduler()
    # 启动Flask开发服务器
    print("Hello")
    app.run(host="0.0.0.0", port=6359, debug=False, use_reloader=False)
