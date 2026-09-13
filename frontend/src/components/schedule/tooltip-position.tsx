"use client";
import { createContext, useContext } from "react";
export const TooltipPosition = createContext({ fraction: 0.5, width: 600 });
export const useTooltipPosition = () => useContext(TooltipPosition);
