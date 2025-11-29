import React from 'react';
import { Card, CardColor, CardType } from '../types';

interface CardProps {
  card: Card;
  onClick?: () => void;
  isSelected?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const CardComponent: React.FC<CardProps> = ({ card, onClick, isSelected = false, disabled = false, size = 'md' }) => {
  const getColorClass = (color: CardColor) => {
    switch (color) {
      case CardColor.RED: return 'bg-red-500 text-white';
      case CardColor.BLUE: return 'bg-blue-500 text-white';
      case CardColor.GREEN: return 'bg-emerald-500 text-white';
      case CardColor.YELLOW: return 'bg-yellow-400 text-black';
      case CardColor.WILD: return 'bg-purple-900 text-white border-2 border-yellow-400'; // Wild look
      case CardColor.SKIP: return 'bg-slate-800 text-white border-2 border-red-500';
      default: return 'bg-gray-300 text-black';
    }
  };

  const getCornerValue = () => {
    if (card.type === CardType.WILD) return 'W';
    if (card.type === CardType.SKIP) return '🚫';
    return card.value;
  };

  // Size mapping
  const dims = {
    sm: 'w-12 h-16 text-xs rounded',
    md: 'w-20 h-28 text-base rounded-lg',
    lg: 'w-24 h-36 text-xl rounded-xl'
  }[size];

  const selectedClass = isSelected ? 'ring-4 ring-offset-2 ring-offset-slate-900 ring-indigo-400 -translate-y-4' : '';
  const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-2';

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`
        ${dims}
        ${getColorClass(card.color)}
        ${selectedClass}
        ${disabledClass}
        relative flex flex-col items-center justify-center shadow-lg font-bold transition-all duration-200 select-none border border-white/10
      `}
    >
      {/* Top Left */}
      <div className="absolute top-1 left-1.5 leading-none opacity-80">
        {getCornerValue()}
      </div>

      {/* Center Big */}
      <div className="text-2xl md:text-4xl drop-shadow-md">
        {card.type === CardType.WILD ? '★' : card.type === CardType.SKIP ? '🚫' : card.value}
      </div>

      {/* Bottom Right (Inverted) */}
      <div className="absolute bottom-1 right-1.5 leading-none rotate-180 opacity-80">
        {getCornerValue()}
      </div>
      
      {/* Wild Label */}
      {card.type === CardType.WILD && (
        <div className="absolute bottom-6 text-[0.5rem] tracking-widest uppercase opacity-75">Wild</div>
      )}
    </div>
  );
};

export default CardComponent;