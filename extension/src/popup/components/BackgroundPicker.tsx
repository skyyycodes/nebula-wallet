import React, { useState, useRef } from 'react';
import { BackgroundOption, PRESET_GRADIENTS } from '../hooks/useBackground';

interface BackgroundPickerProps {
    isOpen: boolean;
    onClose: () => void;
    currentBackground: BackgroundOption;
    customImages: BackgroundOption[];
    onApply: (bg: BackgroundOption) => void;
    onUploadImage: (imageDataUrl: string, name: string) => Promise<BackgroundOption>;
    onRemoveImage: (id: string) => void;
}

export function BackgroundPicker({
    isOpen,
    onClose,
    currentBackground,
    customImages,
    onApply,
    onUploadImage,
    onRemoveImage,
}: BackgroundPickerProps) {
    const [selectedBackground, setSelectedBackground] = useState<BackgroundOption>(currentBackground);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleApply = () => {
        onApply(selectedBackground);
        onClose();
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('Image size should be less than 2MB');
            return;
        }

        setIsUploading(true);

        try {
            // Convert to base64
            const reader = new FileReader();
            reader.onload = async (event) => {
                const imageDataUrl = event.target?.result as string;
                const name = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
                const newImage = await onUploadImage(imageDataUrl, name);
                setSelectedBackground(newImage);
                setIsUploading(false);
            };
            reader.onerror = () => {
                alert('Error reading file');
                setIsUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Error uploading image:', error);
            setIsUploading(false);
        }

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const getCardStyle = (bg: BackgroundOption): React.CSSProperties => {
        if (bg.type === 'gradient') {
            return { background: bg.value };
        }
        return {
            backgroundImage: `url(${bg.value})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
        };
    };

    const allBackgrounds = [...PRESET_GRADIENTS, ...customImages];

    return (
        <div className="bg-picker-overlay" onClick={onClose}>
            <div className="bg-picker-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-picker-header">
                    <button className="bg-picker-back" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 12H5" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                    </button>
                    <h2 className="bg-picker-title">Change background</h2>
                </div>

                {/* Preview Card */}
                <div className="bg-picker-preview-container">
                    <div className="bg-picker-preview-card" style={getCardStyle(selectedBackground)}>
                        <div className="preview-card-overlay">
                            {/* Placeholder content to simulate card */}
                            <div className="preview-placeholder-line long" />
                            <div className="preview-placeholder-line short" />
                            <div className="preview-placeholder-dots">
                                <div className="preview-dot" />
                                <div className="preview-dot" />
                                <div className="preview-dot" />
                                <div className="preview-dot" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Background Info */}
                <div className="bg-picker-info">
                    <h3 className="bg-info-name">{selectedBackground.name}</h3>
                    <p className="bg-info-description">{selectedBackground.description}</p>
                </div>

                {/* Options Grid */}
                <div className="bg-picker-options">
                    {allBackgrounds.map((bg) => (
                        <button
                            key={bg.id}
                            className={`bg-option ${selectedBackground.id === bg.id ? 'selected' : ''}`}
                            style={getCardStyle(bg)}
                            onClick={() => setSelectedBackground(bg)}
                        >
                            {bg.type === 'image' && (
                                <button
                                    className="bg-option-remove"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveImage(bg.id);
                                        if (selectedBackground.id === bg.id) {
                                            setSelectedBackground(PRESET_GRADIENTS[2]);
                                        }
                                    }}
                                >
                                    ×
                                </button>
                            )}
                        </button>
                    ))}

                    {/* Upload Button */}
                    <button
                        className="bg-option upload-option"
                        onClick={handleUploadClick}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <div className="upload-spinner" />
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Hidden File Input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />

                {/* Apply Button */}
                <button className="bg-picker-apply" onClick={handleApply}>
                    Apply
                </button>
            </div>
        </div>
    );
}
