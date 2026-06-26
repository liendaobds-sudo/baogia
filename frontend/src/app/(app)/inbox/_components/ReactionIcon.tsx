'use client';
import React from 'react';

const reactionMap: Record<string, string> = {
    // Emoji variants
    '👍': '/images/reactions/like.png',
    '❤️': '/images/reactions/heart.png',
    '😆': '/images/reactions/haha.png',
    '😮': '/images/reactions/wow.png',
    '😢': '/images/reactions/cry.png',
    '😡': '/images/reactions/angry.png',
    
    // Zalo specific codes
    '/-strong': '/images/reactions/like.png',
    '/-heart': '/images/reactions/heart.png',
    '/-haha': '/images/reactions/haha.png',
    ':>': '/images/reactions/haha.png', // Often used for haha/smile
    '/-wow': '/images/reactions/wow.png',
    '/-cry': '/images/reactions/cry.png',
    '/-angry': '/images/reactions/angry.png',
    
    // Some other common Zalo mappings just in case
    ':)': '/images/reactions/like.png',
    ':-(': '/images/reactions/cry.png',
    ':-D': '/images/reactions/haha.png',
    ':-P': '/images/reactions/haha.png',
};

const ReactionIcon = ({ type, size = 28, style }: { type: string, size?: number, style?: React.CSSProperties }) => {
    const src = reactionMap[type];

    if (!src) {
        return (
            <span style={{
                fontSize: size * 0.75, lineHeight: 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: size, height: size, ...style
            }}>{type}</span>
        );
    }

    /* eslint-disable @next/next/no-img-element */
    return (
        <img
            src={src}
            alt={type}
            width={size}
            height={size}
            style={{
                width: size,
                height: size,
                objectFit: 'contain',
                display: 'block',
                ...style
            }}
            draggable={false}
        />
    );
};

export default ReactionIcon;
