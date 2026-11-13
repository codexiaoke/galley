"use client";

import { createContext, useContext } from "react";

/**
 * 演示模式的整体速度。演示把它提供给页里所有的播放器（算法动画、比赛、代码演变），
 * 播放器在自己的速度上再乘这个数：调快演示时，翻页和页里的动画一起变快。
 * 不在演示里时是 1。
 */
export const PresentSpeed = createContext(1);

export const usePresentSpeed = () => useContext(PresentSpeed);

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export const formatSpeed = (s: number) => `${s}×`;
