import React from 'react';
import { Composition } from 'remotion';
import { Demo, DEMO_DURATION } from './Demo';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Demo"
    component={Demo}
    durationInFrames={DEMO_DURATION}
    fps={30}
    width={1920}
    height={1080}
  />
);
