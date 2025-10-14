interface TurnLogProps {
  entries: string[]
}

export const TurnLog: React.FC<TurnLogProps> = ({ entries }) => (
  <section className="turn-log">
    <h3>事件日志</h3>
    <div className="turn-log__scroll">
      {entries.length === 0 ? (
        <p>暂无日志。</p>
      ) : (
        <ol>
          {entries.map((entry, index) => (
            <li key={`${index}-${entry.slice(0, 12)}`}>{entry}</li>
          ))}
        </ol>
      )}
    </div>
  </section>
)

export default TurnLog
