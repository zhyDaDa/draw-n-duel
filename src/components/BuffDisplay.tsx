import { Tooltip } from "antd";
import type { BuffDefinition } from "../game/types";
import "./BuffDisplay.css";
import { useGameContext } from "../context/GameContext";

interface BuffDisplayProps {
  buff: BuffDefinition;
}

export const BuffDisplay: React.FC<BuffDisplayProps> = ({ buff }) => {
  const { situation } = useGameContext();
  const tooltipContent = (
    <div className="buff-tooltip">
      <header>
        <strong>
          {typeof buff.B_name === "function"
            ? buff.B_name(buff, situation)
            : "(增益)"}
        </strong>
        {!buff.B_isPermanent && (
          <span className="buff-tooltip__temp">临时</span>
        )}
      </header>
      <p>
        {typeof buff.B_description === "function"
          ? buff.B_description(buff, situation)
          : ""}
      </p>
      <footer>
        <span>类型: {buff.B_category?.join("/") ?? "—"}</span>
        <br />
        <span>
          数值:
          {typeof buff.B_valueDict === "undefined"
            ? "—"
            : Object.entries(buff.B_valueDict).map(([k, v]) => (
                <li key={k}>
                  {" - "}
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
          !buff.B_isPermanent ? "buff-display--temp" : ""
        }`}
      >
        <img
          src={buff.B_icon}
          alt={
            typeof buff.B_name === "function"
              ? buff.B_name(buff, situation)
              : "Buff 图标"
          }
          className="buff-display__icon"
        />
        {buff.count && buff.count > 1 && (
          <span className="buff-display__count-corner">
            <span className="buff-display__count-text">{buff.count}</span>
          </span>
        )}
        {!buff.B_isPermanent && <span className="buff-display__badge" />}
      </div>
    </Tooltip>
  );
};

export default BuffDisplay;
