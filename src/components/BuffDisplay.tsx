import { Tooltip } from "antd";
import type { PlayerBuff } from "../game/types";
import "./BuffDisplay.css";

interface BuffDisplayProps {
  buff: PlayerBuff;
}

export const BuffDisplay: React.FC<BuffDisplayProps> = ({ buff }) => {
  const tooltipContent = (
    <div className="buff-tooltip">
      <header>
        <strong>{buff.name}</strong>
        {!buff.isPermanent && <span className="buff-tooltip__temp">临时</span>}
      </header>
      <p>{buff.description}</p>
      <footer>
        <span>类型: {buff.effect.type}</span>
        {buff.effect.value !== undefined && (
          <span> | 数值: {buff.effect.value}</span>
        )}
      </footer>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} overlayClassName="tooltip-light">
      <div className={`buff-display ${!buff.isPermanent ? "buff-display--temp" : ""}`}>
        <img src={buff.icon} alt={buff.name} className="buff-display__icon" />
        {buff.count > 1 && (
          <span className="buff-display__count-corner">
            <span className="buff-display__count-text">{buff.count}</span>
          </span>
        )}
        {!buff.isPermanent && <span className="buff-display__badge" />}
      </div>
    </Tooltip>
  );
};

export default BuffDisplay;
