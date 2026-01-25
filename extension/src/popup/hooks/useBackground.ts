import { useState, useEffect, useCallback } from 'react';

export interface BackgroundOption {
    id: string;
    type: 'gradient' | 'image';
    name: string;
    description: string;
    value: string; // CSS gradient or base64/URL for images
    textColor?: 'light' | 'dark'; // For contrast
}

// Preset gradient backgrounds
export const PRESET_GRADIENTS: BackgroundOption[] = [
    {
        id: 'charcoal',
        type: 'gradient',
        name: 'Midnight',
        description: 'Sleek and sophisticated dark theme.',
        value: 'linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 50%, #0f0f0f 100%)',
        textColor: 'light',
    },
    {
        id: 'dark-gray',
        type: 'gradient',
        name: 'Shadow',
        description: 'Deep and mysterious vibes.',
        value: 'linear-gradient(135deg, #3d3d3d 0%, #2a2a2a 50%, #1a1a1a 100%)',
        textColor: 'light',
    },
    {
        id: 'solar-surge',
        type: 'gradient',
        name: 'Solar Surge',
        description: 'Watch your balance shine as you soar to the moon.',
        value: 'linear-gradient(135deg, #f5d742 0%, #e6c72e 50%, #d4b52a 100%)',
        textColor: 'dark',
    },
    {
        id: 'silver',
        type: 'gradient',
        name: 'Platinum',
        description: 'Clean and minimal elegance.',
        value: 'linear-gradient(135deg, #e8e8e8 0%, #d0d0d0 50%, #b8b8b8 100%)',
        textColor: 'dark',
    },
    {
        id: 'mint',
        type: 'gradient',
        name: 'Fresh Mint',
        description: 'Cool and refreshing green tones.',
        value: 'linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 50%, #81c784 100%)',
        textColor: 'dark',
    },
    {
        id: 'ocean',
        type: 'gradient',
        name: 'Ocean Blue',
        description: 'Deep blue waters await.',
        value: 'linear-gradient(135deg, #667eea 0%, #5a6fd6 50%, #764ba2 100%)',
        textColor: 'light',
    },
    {
        id: 'sunset',
        type: 'gradient',
        name: 'Sunset Glow',
        description: 'Warm gradient of dusk.',
        value: 'linear-gradient(135deg, #ff9a56 0%, #ff6b6b 50%, #ee5a5a 100%)',
        textColor: 'dark',
    },
    {
        id: 'aurora',
        type: 'gradient',
        name: 'Aurora',
        description: 'Northern lights inspiration.',
        value: 'linear-gradient(135deg, #00d68f 0%, #00b4d8 50%, #667eea 100%)',
        textColor: 'dark',
    },
];

const STORAGE_KEY = 'wallet_background';
const CUSTOM_IMAGES_KEY = 'wallet_custom_images';

interface UseBackgroundReturn {
    currentBackground: BackgroundOption;
    customImages: BackgroundOption[];
    setBackground: (bg: BackgroundOption) => Promise<void>;
    addCustomImage: (imageDataUrl: string, name: string) => Promise<BackgroundOption>;
    removeCustomImage: (id: string) => Promise<void>;
    isLoading: boolean;
}

export function useBackground(): UseBackgroundReturn {
    const [currentBackground, setCurrentBackground] = useState<BackgroundOption>(PRESET_GRADIENTS[2]); // Default: Solar Surge
    const [customImages, setCustomImages] = useState<BackgroundOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Load saved background on mount
    useEffect(() => {
        const loadBackground = async () => {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    const result = await chrome.storage.local.get([STORAGE_KEY, CUSTOM_IMAGES_KEY]);

                    if (result[STORAGE_KEY]) {
                        setCurrentBackground(result[STORAGE_KEY]);
                    }

                    if (result[CUSTOM_IMAGES_KEY]) {
                        setCustomImages(result[CUSTOM_IMAGES_KEY]);
                    }
                }
            } catch (error) {
                console.error('Error loading background:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadBackground();
    }, []);

    // Save background to storage
    const setBackground = useCallback(async (bg: BackgroundOption) => {
        try {
            setCurrentBackground(bg);
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.local.set({ [STORAGE_KEY]: bg });
            }
        } catch (error) {
            console.error('Error saving background:', error);
        }
    }, []);

    // Add custom image
    const addCustomImage = useCallback(async (imageDataUrl: string, name: string): Promise<BackgroundOption> => {
        const newImage: BackgroundOption = {
            id: `custom-${Date.now()}`,
            type: 'image',
            name: name || 'Custom Image',
            description: 'Your uploaded background.',
            value: imageDataUrl,
            textColor: 'light', // Default to light text for custom images
        };

        const updatedImages = [...customImages, newImage];
        setCustomImages(updatedImages);

        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.local.set({ [CUSTOM_IMAGES_KEY]: updatedImages });
            }
        } catch (error) {
            console.error('Error saving custom image:', error);
        }

        return newImage;
    }, [customImages]);

    // Remove custom image
    const removeCustomImage = useCallback(async (id: string) => {
        const updatedImages = customImages.filter(img => img.id !== id);
        setCustomImages(updatedImages);

        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.local.set({ [CUSTOM_IMAGES_KEY]: updatedImages });
            }

            // If removed image was current background, reset to default
            if (currentBackground.id === id) {
                await setBackground(PRESET_GRADIENTS[2]);
            }
        } catch (error) {
            console.error('Error removing custom image:', error);
        }
    }, [customImages, currentBackground, setBackground]);

    return {
        currentBackground,
        customImages,
        setBackground,
        addCustomImage,
        removeCustomImage,
        isLoading,
    };
}
