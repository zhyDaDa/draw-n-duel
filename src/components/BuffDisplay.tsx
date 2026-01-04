import { Tooltip } from "antd";
import type { PlayerBuff } from "../game/types";
import "./BuffDisplay.css";
import { useGameContext } from "../context/GameContext";

interface BuffDisplayProps {
  buff: PlayerBuff;
}

export const BuffDisplay: React.FC<BuffDisplayProps> = ({ buff }) => {
  const { situation } = useGameContext();
  const tooltipContent = (
    <div className="buff-tooltip">
      <header>
        <strong>{buff.name(situation)}</strong>
        {!buff.isPermanent && <span className="buff-tooltip__temp">临时</span>}
      </header>
      <p>{buff.description(situation)}</p>
      <footer>
        <span>类型: {buff.category?.join("/") ?? "—"}</span>
        <span>
          数值:
          {typeof buff.valueDict === "undefined"
            ? "—"
            : Object.entries(buff.valueDict).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
        </span>
      </footer>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} overlayClassName="tooltip-light">
      <div
        className={`buff-display ${
          !buff.isPermanent ? "buff-display--temp" : ""
        }`}
      >
        <img
          src={buff.icon}
          alt={buff.name?.(situation) ?? "Buff 图标"}
          className="buff-display__icon"
        />
        {buff.count && buff.count > 1 && (
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
