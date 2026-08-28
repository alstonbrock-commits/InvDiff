import React from 'react';
import { Image } from 'react-native';

interface WatermarkProps {
  /** Distance from the header's top edge. */
  top: number;
  /** Distance from the right edge; negative bleeds off-screen. */
  right: number;
  /** Square edge length. */
  size: number;
}

// The reference positions this with `left` inside a 336px frame; we convert to a
// right offset so the placement survives any viewport width. Requires
// overflow:'hidden' on the parent.
export default function Watermark({ top, right, size }: WatermarkProps) {
  return (
    <Image
      source={require('../../assets/id-mark.png')}
      style={{
        position: 'absolute',
        top,
        right,
        width: size,
        height: size,
        opacity: 0.1,
      }}
      resizeMode="contain"
    />
  );
}
