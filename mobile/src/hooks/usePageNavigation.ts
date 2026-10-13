import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Tab } from "../types";
import { ADMIN_TABS } from "../components/AdminAppShell";

export interface PageNavState {
  page: Tab;
  setPage: (next: Tab) => void;
  goBack: () => void;
  pageHistory: Tab[];
  containerWidth: number;
  setContainerWidth: (w: number) => void;
  pageScrollRef: React.RefObject<ScrollView | null>;
  mountedTabs: Set<string>;
  subPageAnim: Animated.Value;
  onPageScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onPageScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function usePageNavigation(): PageNavState {
  const { width: windowWidth } = useWindowDimensions();
  const [page, setPageState] = useState<Tab>("dashboard");
  const [pageHistory, setPageHistory] = useState<Tab[]>(["dashboard"]);
  const [containerWidth, setContainerWidth] = useState(
    windowWidth || Dimensions.get("window").width,
  );
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set(ADMIN_TABS));

  const pageScrollRef = useRef<ScrollView>(null);
  const isProgrammaticScroll = useRef(false);
  const prevContainerWidth = useRef(containerWidth);
  const subPageAnim = useRef(new Animated.Value(0)).current;

  // Sync window width changes
  useEffect(() => {
    if (windowWidth > 0 && Math.abs(windowWidth - containerWidth) > 1) {
      setContainerWidth(windowWidth);
    }
  }, [windowWidth, containerWidth]);

  // Re-align pager on orientation / width change
  useEffect(() => {
    if (
      containerWidth > 0 &&
      containerWidth !== prevContainerWidth.current &&
      ADMIN_TABS.includes(page)
    ) {
      prevContainerWidth.current = containerWidth;
      const idx = ADMIN_TABS.indexOf(page);
      if (idx >= 0) {
        pageScrollRef.current?.scrollTo({ x: idx * containerWidth, animated: false });
      }
    }
  }, [containerWidth, page]);

  // Sub-page slide animation
  const isDetailSubPage = page === "hostels" || page === "repairs" || page === "notifications";

  useEffect(() => {
    if (isDetailSubPage) {
      subPageAnim.setValue(0);
      Animated.spring(subPageAnim, {
        toValue: 1, tension: 65, friction: 10, useNativeDriver: true,
      }).start();
    } else {
      subPageAnim.setValue(0);
    }
  }, [isDetailSubPage, subPageAnim]);

  const goBack = useCallback(() => {
    setPageHistory((prev) => {
      let prevPage: Tab = "dashboard";
      let updated: Tab[] = ["dashboard"];
      if (prev.length > 1) {
        updated = prev.slice(0, -1);
        prevPage = updated[updated.length - 1];
      }
      setPageState(prevPage);
      if (ADMIN_TABS.includes(prevPage)) {
        const idx = ADMIN_TABS.indexOf(prevPage);
        if (idx >= 0 && containerWidth > 0) {
          pageScrollRef.current?.scrollTo({ x: idx * containerWidth, animated: true });
        }
      }
      return updated;
    });
  }, [containerWidth]);

  // Android hardware back button
  useEffect(() => {
    const handler = () => {
      if (pageHistory.length > 1 || page !== "dashboard") {
        goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", handler);
    return () => sub.remove();
  }, [pageHistory, page, goBack]);

  const setPage = useCallback((next: Tab) => {
    const normalized = next === "fees" ? "payments" : next;
    setPageHistory((prev) =>
      prev[prev.length - 1] === normalized ? prev : [...prev, normalized],
    );
    setPageState(normalized);
    setMountedTabs((prev) => {
      if (prev.has(normalized)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(normalized);
      return nextSet;
    });
    if (ADMIN_TABS.includes(normalized)) {
      const idx = ADMIN_TABS.indexOf(normalized);
      if (idx >= 0 && containerWidth > 0) {
        isProgrammaticScroll.current = true;
        pageScrollRef.current?.scrollTo({ x: idx * containerWidth, animated: true });
        setTimeout(() => {
          isProgrammaticScroll.current = false;
        }, 350);
      }
    }
  }, [containerWidth]);

  const onPageScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isProgrammaticScroll.current) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const width = containerWidth || Dimensions.get("window").width;
    if (width <= 0) return;
    const idx = Math.round(offsetX / width);
    if (idx >= 0 && idx < ADMIN_TABS.length) {
      const targetTab = ADMIN_TABS[idx];
      if (targetTab && targetTab !== page) setPageState(targetTab);
    }
  }, [containerWidth, page]);

  const onPageScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    isProgrammaticScroll.current = false;
    const offsetX = e.nativeEvent.contentOffset.x;
    const width = containerWidth || Dimensions.get("window").width;
    if (width <= 0) return;
    const idx = Math.round(offsetX / width);
    if (idx >= 0 && idx < ADMIN_TABS.length) {
      const targetTab = ADMIN_TABS[idx];
      if (targetTab) {
        setPageState(targetTab);
        setPageHistory((prev) =>
          prev[prev.length - 1] === targetTab ? prev : [...prev, targetTab],
        );
      }
    }
  }, [containerWidth]);

  return {
    page,
    setPage,
    goBack,
    pageHistory,
    containerWidth,
    setContainerWidth,
    pageScrollRef,
    mountedTabs,
    subPageAnim,
    onPageScroll,
    onPageScrollEnd,
  };
}
