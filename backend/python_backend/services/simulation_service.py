# backend/python_backend/services/simulation_service.py

from .matlab_engine_service import matlab_service
import uuid
import redis
import json

class SimulationService:
    """
    处理与仿真任务相关的业务逻辑。
    """
    def __init__(self):
        # 初始化Redis连接
        try:
            self.redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
            self.redis_client.ping() # 检查连接
            print("已成功连接到Redis服务器。")
        except redis.exceptions.ConnectionError as e:
            print(f"警告：无法连接到Redis服务器: {e}。IQ数据将不会被缓存。")
            self.redis_client = None

    def start_simulation(self, config: dict) -> dict:
        """
        调用MATLAB引擎来启动一个新的仿真任务。
        """
        try:
            simulation_id = f"sim_{uuid.uuid4().hex[:8]}"
            print(f"接收到仿真请求，ID: {simulation_id}")

            # --- MATLAB 调用 ---
            matlab_service.start_engine()
            matlab_project_path = 'E:\\Projects\\SatelliateSpectrumSensing\\backend\\matlab'
            matlab_service.eng.addpath(matlab_service.eng.genpath(matlab_project_path))
            
            # --- 调用完整链路仿真 ---
            # 构造传递给MATLAB的参数
            # 将整个config作为参数传递，因为它现在包含了完整的场景快照
            sim_params = config
            sim_params['shell'] = 'Shell1' # 暂时硬编码shell

            results = matlab_service.eng.interface.api.run_full_link_simulation(sim_params, nargout=1)
            results['simulationId'] = simulation_id

            # --- 将IQ数据存入Redis ---
            if self.redis_client and results.get('status') == 'success':
                redis_key = results.get('redis_key')
                iq_data = results.get('rx_iq_data')
                if redis_key and iq_data:
                    # 将IQ数据转换为JSON字符串进行存储
                    self.redis_client.set(redis_key, json.dumps(iq_data), ex=3600) # 缓存1小时
                    print(f"IQ数据已存入Redis，键: {redis_key}")
                    # 从返回给前端的结果中移除庞大的IQ数据，只保留键
                    results.pop('rx_iq_data') 

            print(f"仿真任务 {simulation_id} 完成。")
            return results

        except Exception as e:
            print(f"启动仿真时发生严重错误: {e}")
            raise

# 创建SimulationService的单例
simulation_service = SimulationService()
