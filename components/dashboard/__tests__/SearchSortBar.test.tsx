import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    SearchSortBar,
    filtersAreEmpty,
    EMPTY_FILTERS,
    type InventoryFilters,
} from '../SearchSortBar';

describe('filtersAreEmpty', () => {
    it('is true for the EMPTY_FILTERS constant', () => {
        expect(filtersAreEmpty(EMPTY_FILTERS)).toBe(true);
    });

    it('is false when any field is set', () => {
        expect(filtersAreEmpty({ ...EMPTY_FILTERS, priceMin: '10' })).toBe(false);
        expect(filtersAreEmpty({ ...EMPTY_FILTERS, platforms: ['grailed'] })).toBe(false);
        expect(filtersAreEmpty({ ...EMPTY_FILTERS, notCrosslisted: true })).toBe(false);
    });
});

function setup(overrides: Partial<React.ComponentProps<typeof SearchSortBar>> = {}) {
    const onQueryChange = jest.fn();
    const onSortChange = jest.fn();
    const onFiltersChange = jest.fn();
    const props = {
        query: '',
        onQueryChange,
        sort: 'newest' as const,
        onSortChange,
        filters: EMPTY_FILTERS as InventoryFilters,
        onFiltersChange,
        resultCount: 3,
        totalCount: 10,
        ...overrides,
    };
    render(<SearchSortBar {...props} />);
    return { onQueryChange, onSortChange, onFiltersChange };
}

describe('SearchSortBar', () => {
    it('renders the search box and sort dropdown', () => {
        setup();
        expect(screen.getByPlaceholderText(/search by title/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/sort listings/i)).toBeInTheDocument();
    });

    it('emits query changes as the user types', () => {
        const { onQueryChange } = setup();
        fireEvent.change(screen.getByPlaceholderText(/search by title/i), {
            target: { value: 'nike' },
        });
        expect(onQueryChange).toHaveBeenCalledWith('nike');
    });

    it('shows a clear-search button only while searching', () => {
        const { onQueryChange } = setup({ query: 'nike' });
        const clear = screen.getByLabelText(/clear search/i);
        fireEvent.click(clear);
        expect(onQueryChange).toHaveBeenCalledWith('');
    });

    it('emits sort changes', () => {
        const { onSortChange } = setup();
        fireEvent.change(screen.getByLabelText(/sort listings/i), {
            target: { value: 'price-asc' },
        });
        expect(onSortChange).toHaveBeenCalledWith('price-asc');
    });

    it('reveals the filter panel when the Filters button is toggled', () => {
        setup();
        // Panel hidden initially (no active filters) → no price inputs visible
        expect(screen.queryByPlaceholderText('Min')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /filters/i }));
        expect(screen.getByPlaceholderText('Min')).toBeInTheDocument();
    });

    it('toggles a platform filter via the platform chip', () => {
        const { onFiltersChange } = setup();
        fireEvent.click(screen.getByRole('button', { name: /filters/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Grailed' }));
        expect(onFiltersChange).toHaveBeenCalledWith(
            expect.objectContaining({ platforms: ['grailed'] })
        );
    });

    it('starts with the panel open and shows clear-all when filters are active', () => {
        const { onFiltersChange } = setup({
            filters: { ...EMPTY_FILTERS, platforms: ['grailed'] },
        });
        const clearAll = screen.getByRole('button', { name: /clear filters/i });
        fireEvent.click(clearAll);
        expect(onFiltersChange).toHaveBeenCalledWith(EMPTY_FILTERS);
    });

    it('shows the result count line when searching', () => {
        setup({ query: 'nike', resultCount: 2, totalCount: 9 });
        expect(screen.getByText(/2 of 9 listings/i)).toBeInTheDocument();
    });
});
