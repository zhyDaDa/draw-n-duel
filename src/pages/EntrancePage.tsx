import { Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../context/SettingsContext";
import "../App.css";

const EntrancePage: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();

  return (
    <div className="entrance-page">
      <div className="entrance-page__card">
        <Typography.Title level={1}>纯粹抽卡决斗</Typography.Title>
        <Typography.Paragraph>
          选择一个模式开始游戏，或先调整你的偏好设置。
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          当前单人模式 AI 数量：{settings.soloAiCount}
        </Typography.Paragraph>
        <div className="entrance-page__buttons">
          <button
            type="button"
            className="btn btn--accent"
            onClick={() => navigate("/game_play?mode=solo")}
          >
            单人模式
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => navigate("/game_play?mode=versus")}
          >
            对战模式
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate("/settings")}
          >
            设置
          </button>
        </div>
      </div>
    </div>
  );
};

export default EntrancePage;
