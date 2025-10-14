import { useMemo, useState } from 'react'
import CardDisplay from './components/CardDisplay'
import MerchantModal from './components/MerchantModal'
import PlayerHUD from './components/PlayerHUD'
import TurnLog from './components/TurnLog'
import {
  acceptMerchantOffer,
  createInitialState,
  discardActiveCard,
  drawCard,
  finishPlayerTurn,
  playActiveCard,
  releaseHoldCard,
  skipMerchant,
  stashActiveCard,
  unpackBackpack,
} from './game/engine'
import type { ActionResult, EngineError, EngineOutcome, GameState, ResolveResult } from './game/types'
import './App.css'

const isEngineError = <T,>(outcome: EngineOutcome<T>): outcome is EngineError =>
  (outcome as EngineError)?.type !== undefined

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(() => createInitialState())
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const handleOutcome = (outcome: EngineOutcome<ActionResult | ResolveResult>) => {
    if (isEngineError(outcome)) {
      setStatusMessage(outcome.message)
      return
    }
    setGameState(outcome.state)
    setStatusMessage(outcome.messages?.join(' ') ?? null)
  }

  const handleGameStateUpdate = (outcome: EngineOutcome<GameState>) => {
    if (isEngineError(outcome)) {
      setStatusMessage(outcome.message)
      return
    }
    setGameState(outcome)
    setStatusMessage(null)
  }

  const handleDraw = () => {
    const result = drawCard(gameState)
    handleOutcome(result)
  }

  const handlePlay = () => {
    const result = playActiveCard(gameState)
    handleOutcome(result)
  }

  const handleStash = () => {
    const result = stashActiveCard(gameState)
    handleOutcome(result)
  }

  const handleDiscard = () => {
    const result = discardActiveCard(gameState)
    handleOutcome(result)
  }

  const handleReleaseHold = () => {
    const result = releaseHoldCard(gameState)
    handleOutcome(result)
  }

  const handleUnpack = (index: number) => {
    const result = unpackBackpack(gameState, index)
    handleGameStateUpdate(result)
  }

  const handleEndTurn = () => {
    const nextState = finishPlayerTurn(gameState)
    setGameState(nextState)
    setStatusMessage('进入结算阶段。')
  }

  const handleSkipMerchant = () => {
    const nextState = skipMerchant(gameState)
    setGameState(nextState)
    setStatusMessage('你离开了商人。')
  }

  const handleAcceptMerchant = (index: number) => {
    const result = acceptMerchantOffer(gameState, index)
    handleGameStateUpdate(result)
  }

  const handleReset = () => {
    setGameState(createInitialState())
    setStatusMessage('已重置对决。')
  }

  const isPlayerTurn = gameState.phase === 'playerTurn'
  const canPlay = Boolean(gameState.activeCard)
  const canStash = gameState.activeCard && !gameState.player.holdSlot
  const canDiscard = Boolean(gameState.activeCard)

  const deckStats = useMemo(
    () => `卡堆剩余：${gameState.deck.drawPile.length} 张｜稀有剩余 ${gameState.deck.publicInfo.remainingRare}｜碎片 ${gameState.deck.publicInfo.remainingShards}`,
    [gameState.deck.drawPile.length, gameState.deck.publicInfo.remainingRare, gameState.deck.publicInfo.remainingShards],
  )

  return (
    <div id="app-root">
      <header className="top-bar">
        <div>
          <h1>纯粹抽卡决斗</h1>
          <p>层级 {gameState.level}｜阶段：{gameState.phase}</p>
        </div>
        <div className="top-bar__actions">
          <button type="button" className="btn btn--ghost" onClick={handleReset}>
            重置对决
          </button>
        </div>
      </header>

      <p className="deck-stats">{deckStats}</p>

      {statusMessage && <div className="status-banner">{statusMessage}</div>}

      <main className="layout">
        <div className="layout__left">
          <PlayerHUD
            player={gameState.player}
            isCurrent={isPlayerTurn}
            isHuman
            onReleaseHold={handleReleaseHold}
            onUnpackBackpack={handleUnpack}
          />

          <section className="action-panel">
            <h3>玩家操作</h3>
            <div className="action-panel__buttons">
              <button type="button" className="btn" onClick={handleDraw} disabled={!isPlayerTurn || Boolean(gameState.activeCard)}>
                抽卡
              </button>
              <button type="button" className="btn" onClick={handlePlay} disabled={!isPlayerTurn || !canPlay}>
                结算卡牌
              </button>
              <button type="button" className="btn" onClick={handleStash} disabled={!isPlayerTurn || !canStash}>
                滞留
              </button>
              <button type="button" className="btn" onClick={handleDiscard} disabled={!isPlayerTurn || !canDiscard}>
                丢弃
              </button>
              <button type="button" className="btn btn--accent" onClick={handleEndTurn} disabled={!isPlayerTurn || Boolean(gameState.activeCard)}>
                结束回合
              </button>
            </div>

            {gameState.activeCard && (
              <div className="action-panel__active-card">
                <h4>待处理的卡牌</h4>
                <CardDisplay card={gameState.activeCard} highlight />
              </div>
            )}
          </section>
        </div>

        <div className="layout__right">
          <PlayerHUD player={gameState.ai} isCurrent={gameState.phase === 'aiTurn'} isHuman={false} />
          <TurnLog entries={gameState.log} />
        </div>
      </main>

      {gameState.phase === 'matchEnd' && (
        <div className="status-banner status-banner--success">
          {gameState.winner === 'Player' ? '你赢得了整场对决！' : 'AI 获得最终胜利。'}
        </div>
      )}

      <MerchantModal
        isOpen={gameState.phase === 'merchant'}
        offers={gameState.merchantOffers}
        onAccept={handleAcceptMerchant}
        onSkip={handleSkipMerchant}
      />
    </div>
  )
}

export default App
