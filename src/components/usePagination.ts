import { useEffect, useMemo, useState } from "react";

export function usePagination<T>(items: T[], initialPageSize = 10) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const pageCount = Math.max(Math.ceil(items.length / pageSize), 1);
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedItems = useMemo(
    () => items.slice(pageStartIndex, pageStartIndex + pageSize),
    [items, pageSize, pageStartIndex],
  );
  const visibleFrom = items.length === 0 ? 0 : pageStartIndex + 1;
  const visibleTo = Math.min(pageStartIndex + pageSize, items.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [items, pageSize]);

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  return {
    currentPage: safeCurrentPage,
    pageCount,
    pageSize,
    paginatedItems,
    visibleFrom,
    visibleTo,
    setCurrentPage,
    setPageSize,
  };
}
