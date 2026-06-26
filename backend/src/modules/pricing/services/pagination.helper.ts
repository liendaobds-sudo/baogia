/**
 * PaginationHelper — Extract common pagination logic used across services
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_more: boolean;
  };
}

export class PaginationHelper {
  /**
   * Sanitize and normalize pagination parameters.
   * Returns null if pagination is not requested.
   */
  static normalize(params: PaginationParams, maxLimit = 500): { page: number; limit: number; offset: number } | null {
    const page = params.page ? Math.max(1, Math.floor(params.page)) : null;
    const limit = params.limit ? Math.max(1, Math.min(maxLimit, Math.floor(params.limit))) : null;

    if (!page || !limit) return null;

    return {
      page,
      limit,
      offset: (page - 1) * limit,
    };
  }

  /**
   * Build the paginated response wrapper.
   */
  static buildResponse<T>(items: T[], total: number, page: number, limit: number): PaginatedResult<T> {
    const totalPages = Math.ceil(total / limit);
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_more: page < totalPages,
      },
    };
  }
}
