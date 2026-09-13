"use client";
import { createContext, useContext } from "react";
export const TooltipPosition = createContext(0.5);
export const useTooltipPosition = () => useContext(TooltipPosition);
