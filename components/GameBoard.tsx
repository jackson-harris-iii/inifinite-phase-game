import React, { useState, useEffect } from 'react';
import { Player, Card, Phase, TurnPhase, Meld, CardType } from '../types';
import CardComponent from './CardComponent';

interface GameBoardProps {
  currentPlayer: Player;
  opponents: Player[];
  drawPileCount: number;
  discardPileTop: Card | null;
  currentPhase: Phase;
  turnPhase: TurnPhase;
  selectedCards: string[];
  onCardClick: (card: Card) => void;
  onDrawPileClick: () => void;
  onDiscardPileClick: () => void;
  onDiscardAction: () => void;
  onTryMeld: () => void;
  onMeldClick: (meld: Meld) => void;
  onMeldDrop: (cardIndex: number, meldId: string) => void;
  message: string;
  onDismissMessage: () => void;
  onSortHand: () => void;
  onReorderHand: (fromIndex: number, toIndex: number) => void;
  isActivePlayer: boolean;
  timeLeft?: number;
  totalTime?: number;
}

const GameBoard: React.FC<GameBoardProps> = ({
  currentPlayer,
  opponents,
  drawPileCount,
  discardPileTop,
  currentPhase,
  turnPhase,
  selectedCards,
  onCardClick,
  onDrawPileClick,
  onDiscardPileClick,
  onDiscardAction,
  onTryMeld,
  onMeldClick,
  onMeldDrop,
  message,
  onDismissMessage,
  onSortHand,
  onReorderHand,
  isActivePlayer,
  timeLeft = 0,
  totalTime = 0
}) => {
  
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showTurnBanner, setShowTurnBanner] = useState(false);

  // Trigger turn animation when it becomes player's turn
  useEffect(() => {
    if (isActivePlayer && turnPhase === TurnPhase.DRAW) {
      setShowTurnBanner(true);
      const timer = setTimeout(() => setShowTurnBanner(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isActivePlayer, turnPhase]);

  const isMyTurn = isActivePlayer;
  
  // Allow discard in ACTION phase (to end turn without melding) or DISCARD phase
  const canDiscard = isMyTurn && (turnPhase === TurnPhase.DISCARD || turnPhase === TurnPhase.ACTION) && selectedCards.length === 1;
  const canMeld = isMyTurn && turnPhase === TurnPhase.ACTION && selectedCards.length > 0;

  // Hitting Logic: Can hit if in Action phase, Phase laid down.
  const canHit = isMyTurn && turnPhase === TurnPhase.ACTION && currentPlayer.hasLaidDownPhase;

  // Drag Handlers for Hand Reordering
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Drop on Hand (Reorder)
  const handleDropHand = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    if (!sourceIndexStr) return;
    
    const sourceIndex = parseInt(sourceIndexStr, 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    onReorderHand(sourceIndex, targetIndex);
  };

  // Drop on Meld (Hit)
  const handleDropOnMeld = (e: React.DragEvent<HTMLDivElement>, meldId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canHit) return;

    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    if (!sourceIndexStr) return;
    
    const cardIndex = parseInt(sourceIndexStr, 10);
    if (isNaN(cardIndex)) return;

    onMeldDrop(cardIndex, meldId);
  };

  const renderMeld = (meld: Meld, ownerName: string) => (
    <div 
      key={meld.id} 
      onClick={() => canHit && selectedCards.length === 1 ? onMeldClick(meld) : undefined}
      onDragOver={(e) => canHit ? handleDragOver(e) : undefined}
      onDrop={(e) => handleDropOnMeld(e, meld.id)}
      className={`
        relative p-3 rounded-lg border transition-all duration-200 origin-top min-w-[200px]
        ${canHit ? 'bg-indigo-900/40 border-indigo-400/50 cursor-pointer hover:bg-indigo-800/60 shadow-lg shadow-indigo-500/10' : 'bg-slate-800/50 border-slate-700/50'}
      `}
    >
      <div className="text-xs text-slate-300 mb-2 font-bold tracking-wider flex justify-between items-center">
        <span>{ownerName} • {meld.type}</span>
        {canHit && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded animate-pulse">DROP HERE</span>}
      </div>
      <div className="flex flex-wrap gap-1 pl-1">
        <div className="flex -space-x-6">
            {meld.cards.map(c => (
            <div key={c.id} className="hover:-translate-y-2 transition-transform duration-200">
                <CardComponent card={c} size="sm" />
            </div>
            ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-900 overflow-hidden relative">
      
      {/* Timer Progress Bar (Only if time limit exists) */}
      {totalTime > 0 && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 z-50">
            <div 
                className={`h-full transition-all duration-1000 linear ${timeLeft < 10 ? 'bg-red-500' : 'bg-indigo-500'}`} 
                style={{ width: `${(timeLeft / totalTime) * 100}%` }}
            />
        </div>
      )}

      {/* Turn Animation Banner */}
      <div className={`absolute inset-0 z-40 flex items-center justify-center pointer-events-none transition-opacity duration-500 ${showTurnBanner ? 'opacity-100' : 'opacity-0'}`}>
         <div className="bg-black/80 backdrop-blur-sm w-full py-12 flex flex-col items-center justify-center border-y-4 border-indigo-500 shadow-[0_0_50px_rgba(99,102,241,0.5)]">
            <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-indigo-300 uppercase tracking-tighter drop-shadow-[0_5px_5px_rgba(0,0,0,1)] animate-pulse">
              Your Turn
            </h1>
            <p className="text-indigo-200 text-xl font-bold tracking-widest uppercase mt-2">Make your move</p>
         </div>
      </div>

      {/* Top Bar: Opponents & Game Info */}
      <div className="flex-none bg-slate-800 p-2 md:p-4 shadow-md z-10 flex justify-between items-center mt-1">
         <div className="flex gap-6 overflow-x-auto scrollbar-hide px-2">
          {opponents.map((opp) => (
            <div key={opp.id} className={`flex flex-col items-center transition-opacity ${opp.isSkipped ? 'opacity-50 grayscale' : 'opacity-90'}`}>
              <div className="relative">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-indigo-600 flex items-center justify-center font-bold mb-1 border-2 border-indigo-400 shadow-lg">
                  {opp.name.charAt(0)}
                </div>
                {opp.hasLaidDownPhase && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-slate-800 flex items-center justify-center text-[10px]">✓</div>
                )}
              </div>
              <div className="text-xs text-slate-400 max-w-[60px] truncate text-center">{opp.name}</div>
              <div className="text-[10px] text-slate-500">P-{opp.phaseIndex + 1}</div>
              <div className="flex -space-x-6 mt-1">
                 {Array.from({ length: Math.min(opp.hand.length, 5) }).map((_, i) => (
                   <div key={i} className="w-6 h-8 md:w-8 md:h-10 bg-slate-600 rounded border border-slate-500 shadow-sm" />
                 ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="text-right flex items-center gap-3">
           <div className="flex flex-col items-end">
              {totalTime > 0 && (
                  <div className={`text-xl font-mono font-bold ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                      {timeLeft}s
                  </div>
              )}
           </div>
           <button 
             onClick={() => setIsHelpOpen(true)}
             className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-indigo-300 font-bold border border-slate-600 transition-colors"
             title="Game Rules & Controls"
           >
             ?
           </button>
           <div>
              <h2 className="text-xs uppercase tracking-widest text-slate-400">Goal</h2>
              <div className="font-bold text-indigo-300 text-sm md:text-base">{currentPhase?.description}</div>
              <div className="text-xs text-slate-500">Phase {currentPhase?.id}</div>
           </div>
        </div>
      </div>

      {/* Center Field: Decks & Table Melds */}
      <div className="flex-1 relative flex flex-col items-center justify-between overflow-hidden p-2 md:p-4">
        
        {/* Table Texture */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
        </div>

        {/* Notification Toast - Fixed, Dismissible */}
        {message && (
          <div className="absolute top-4 z-[60] flex items-center gap-4 bg-slate-800 text-white px-6 py-3 rounded-lg shadow-2xl border-l-4 border-indigo-500 animate-in slide-in-from-top-4 duration-300">
            <span className="font-medium">{message}</span>
            <button 
                onClick={onDismissMessage} 
                className="text-slate-400 hover:text-white font-bold p-1 hover:bg-slate-700 rounded"
            >
                ✕
            </button>
          </div>
        )}

        {/* Decks Area */}
        <div className="flex gap-8 md:gap-16 items-center justify-center py-4 z-0 relative min-h-[160px]">
          {/* Draw Pile */}
          <div className="flex flex-col items-center gap-2 group">
            <div 
              onClick={isMyTurn && turnPhase === TurnPhase.DRAW ? onDrawPileClick : undefined}
              className={`w-20 h-28 md:w-24 md:h-36 bg-indigo-900 rounded-xl border-4 border-indigo-300/20 flex items-center justify-center shadow-2xl relative
                ${isMyTurn && turnPhase === TurnPhase.DRAW ? 'cursor-pointer hover:-translate-y-2 hover:shadow-indigo-500/50 ring-4 ring-indigo-500/30' : ''}
                transition-all duration-300
              `}
            >
              <div className="w-16 h-24 md:w-20 md:h-32 border-2 border-dashed border-indigo-500/30 rounded opacity-50"></div>
              <div className="absolute bottom-2 right-2 text-xs text-white/50 font-mono">{drawPileCount}</div>
            </div>
            <span className="text-xs font-bold tracking-widest text-indigo-300/50 group-hover:text-indigo-300 uppercase transition-colors">Draw</span>
          </div>

          {/* Discard Pile */}
          <div className="flex flex-col items-center gap-2 group">
            <div className="relative w-20 h-28 md:w-24 md:h-36 border-4 border-dashed border-slate-700 rounded-xl flex items-center justify-center">
              {discardPileTop ? (
                <div 
                  onClick={isMyTurn && turnPhase === TurnPhase.DRAW && discardPileTop.type !== CardType.SKIP ? onDiscardPileClick : undefined}
                  className={`absolute inset-0 ${isMyTurn && turnPhase === TurnPhase.DRAW && discardPileTop.type !== CardType.SKIP ? 'cursor-pointer hover:-translate-y-2' : ''} transition-transform`}
                >
                  <CardComponent card={discardPileTop} size="md" />
                </div>
              ) : (
                <span className="text-slate-700 text-xs uppercase">Empty</span>
              )}
            </div>
            <span className="text-xs font-bold tracking-widest text-slate-500 group-hover:text-slate-400 uppercase transition-colors">Discard</span>
          </div>
        </div>

        {/* All Phases (Scrollable Area) */}
        <div className="w-full max-w-7xl flex-1 overflow-y-auto mb-2 px-4 scrollbar-hide mask-linear border-t border-b border-white/5 bg-white/5 backdrop-blur-sm rounded-xl">
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* My Melds */}
            {currentPlayer.hasLaidDownPhase && currentPlayer.melds.length > 0 && (
              <div className="col-span-full">
                 <h3 className="text-sm font-bold text-indigo-400 uppercase mb-2 border-b border-indigo-500/20 pb-1">My Phase</h3>
                 <div className="flex flex-wrap gap-4">
                   {currentPlayer.melds.map((meld, idx) => renderMeld(meld, "Me"))}
                 </div>
              </div>
            )}

            {/* Opponent Melds */}
            {[...opponents].filter(p => p.hasLaidDownPhase).map(p => (
              <div key={p.id} className="bg-slate-800/30 p-3 rounded-lg border border-white/5">
                 <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex justify-between">
                    <span>{p.name}'s Phase</span>
                    <span className="text-slate-600">P-{p.phaseIndex + 1}</span>
                 </h3>
                 <div className="flex flex-wrap gap-3">
                   {p.melds.map((meld) => renderMeld(meld, p.name))}
                 </div>
              </div>
            ))}
            
            {/* Empty State */}
            {!currentPlayer.hasLaidDownPhase && !opponents.some(o => o.hasLaidDownPhase) && (
              <div className="col-span-full h-32 flex items-center justify-center text-slate-500 text-sm italic">
                No phases laid down yet...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player Area */}
      <div className="flex-none bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 p-4 z-20 pb-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-4">
          
          {/* Controls Row */}
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isMyTurn ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-sm font-bold text-slate-300">
                  {isMyTurn ? (
                    turnPhase === TurnPhase.DRAW ? "Draw a card" :
                    turnPhase === TurnPhase.ACTION ? (
                      canHit ? "Drag card to Phase to HIT or Discard" : "Meld Phase or Discard"
                    ) :
                    "Select card to discard"
                  ) : "Waiting for opponents..."}
                </span>
             </div>
             
             <div className="flex gap-2">
                <button 
                  onClick={onSortHand}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold uppercase tracking-wider text-white transition-colors"
                >
                  Sort
                </button>

                {turnPhase === TurnPhase.ACTION && !currentPlayer.hasLaidDownPhase && (
                  <button
                    onClick={onTryMeld}
                    disabled={!canMeld}
                    className={`px-6 py-2 rounded text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-all
                      ${canMeld ? 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/50' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
                    `}
                  >
                    Play Phase
                  </button>
                )}

                {/* Show Discard Button in both ACTION and DISCARD phases */}
                {(turnPhase === TurnPhase.DISCARD || turnPhase === TurnPhase.ACTION) && (
                   <button
                     onClick={onDiscardAction}
                     disabled={!canDiscard}
                     className={`px-6 py-2 rounded text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-all
                       ${canDiscard ? 'bg-red-600 hover:bg-red-500 hover:shadow-red-500/50' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
                     `}
                   >
                     {turnPhase === TurnPhase.ACTION ? "Discard (End Turn)" : "Discard Selected"}
                   </button>
                )}
             </div>
          </div>

          {/* Hand */}
          <div className="flex justify-center overflow-x-auto pb-4 pt-2 px-4 scrollbar-hide min-h-[150px]">
            <div className="flex -space-x-8 md:-space-x-10 min-w-fit hover:space-x-1 transition-all duration-300">
              {currentPlayer.hand.map((card, index) => (
                <div 
                  key={card.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropHand(e, index)}
                  className="transition-transform hover:-translate-y-6 duration-200 cursor-grab active:cursor-grabbing"
                >
                  <CardComponent 
                    card={card} 
                    size="lg"
                    isSelected={selectedCards.includes(card.id)}
                    onClick={() => onCardClick(card)}
                  />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Help Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-[70] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsHelpOpen(false)}>
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full p-6 relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => setIsHelpOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                    ✕
                </button>
                <h2 className="text-2xl font-bold text-indigo-400 mb-4">How to Play</h2>
                
                <div className="space-y-4 text-slate-300 text-sm max-h-96 overflow-y-auto pr-2">
                    <section>
                        <h3 className="font-bold text-white mb-1">Goal</h3>
                        <p>Complete all 10 phases. To win, complete the final phase and empty your hand. Lowest score wins.</p>
                    </section>
                    
                    <section>
                        <h3 className="font-bold text-white mb-1">Turn Structure</h3>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li><span className="text-indigo-300 font-semibold">Draw</span>: Pick up a card.</li>
                            <li><span className="text-indigo-300 font-semibold">Action</span>: 
                              <ul className="list-disc list-inside ml-4 text-slate-400">
                                <li><strong>Meld:</strong> If you have the cards for your phase, lay them down.</li>
                                <li><strong>Hit:</strong> Once you have laid down your phase, you can add cards to <em>any</em> existing phase on the board. Drag a card from your hand onto a Phase.</li>
                                <li><strong>Discard:</strong> Discard 1 card to end turn.</li>
                              </ul>
                            </li>
                        </ol>
                    </section>

                    <section>
                        <h3 className="font-bold text-white mb-1">Hitting Rules</h3>
                        <p>You must complete your own phase before you can hit on others. Hitting allows you to get rid of extra cards.</p>
                    </section>
                </div>
                
                <div className="mt-6 pt-4 border-t border-slate-700 flex justify-end">
                    <button 
                        onClick={() => setIsHelpOpen(false)}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-bold transition-colors shadow-lg"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default GameBoard;