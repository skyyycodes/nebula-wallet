import React, { useState } from 'react';
import { BLOCK_TEMPLATES, BLOCK_CATEGORIES, BlockCategory } from '../../lib/agent-builder/block-templates';
import * as Icons from 'lucide-react';
import { Search, ChevronRight } from 'lucide-react';

interface BlockPaletteProps {
  onToggleCollapse?: () => void;
}

export default function BlockPalette({ onToggleCollapse }: BlockPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<BlockCategory>('All');

  const filteredBlocks = BLOCK_TEMPLATES.filter(block => {
    const matchesSearch = block.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      block.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || block.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDragStart = (event: React.DragEvent, template: any) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(template));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="block-palette">
      <div className="block-palette-header">
        <div className="palette-title-row">
          <h3>Block Library</h3>
          {onToggleCollapse && (
            <button className="palette-collapse-btn" onClick={onToggleCollapse}>
              <span>Hide</span>
              <ChevronRight size={16} />
            </button>
          )}
        </div>
        <div className="palette-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="palette-categories">
        {BLOCK_CATEGORIES.map((category) => (
          <button
            key={category}
            className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="palette-blocks">
        {filteredBlocks.length === 0 ? (
          <div className="no-blocks">No blocks found</div>
        ) : (
          filteredBlocks.map((template, index) => {
            const IconComponent = (Icons as any)[template.icon] || Icons.Box;
            return (
              <div
                key={`${template.type}-${index}`}
                draggable
                onDragStart={(e) => handleDragStart(e, template)}
                className="palette-block-item"
                style={{ borderLeftColor: template.color }}
              >
                <div
                  className="block-item-icon"
                  style={{ backgroundColor: `${template.color}20` }}
                >
                  <IconComponent
                    size={16}
                    style={{ color: template.color }}
                  />
                </div>
                <div className="block-item-info">
                  <div className="block-item-header">
                    <span className="block-item-label">{template.label}</span>
                    <span className="block-item-type">{template.type.split('_')[0]}</span>
                  </div>
                  <p className="block-item-description">{template.description}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
