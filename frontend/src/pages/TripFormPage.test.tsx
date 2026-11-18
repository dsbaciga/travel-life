/**
 * Trip form validation focus tests
 *
 * Test cases:
 * - TFP-001: a failed submit focuses the title field and scrolls it into view
 * - TFP-002: an end date before the start date focuses the end date field
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripFormPage from './TripFormPage';

vi.mock('../services/trip.service', () => ({
  default: { createTrip: vi.fn(), updateTrip: vi.fn(), getTripById: vi.fn() },
}));
vi.mock('../services/user.service', () => ({
  default: {
    getMe: vi.fn(async () => ({ tripTypes: [] })),
    getTravelPartnerSettings: vi.fn(async () => null),
  },
}));
vi.mock('../services/share.service', () => ({ default: {} }));
vi.mock('../components/MarkdownEditor', () => ({ default: () => <div /> }));
vi.mock('../components/TripCoverImageField', () => ({ default: () => <div /> }));
vi.mock('../components/TripLanguageSelector', () => ({ default: () => <div /> }));

function renderForm() {
  const router = createMemoryRouter([{ path: '/trips/new', element: <TripFormPage /> }], {
    initialEntries: ['/trips/new'],
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe('TripFormPage validation focus', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  it('TFP-001: focuses and scrolls to the title when it is empty', async () => {
    renderForm();
    const form = (await screen.findByLabelText(/^Title/)).closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    const title = screen.getByLabelText(/^Title/);
    await waitFor(() => expect(title).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  it('TFP-002: focuses the end date when it precedes the start date', async () => {
    renderForm();
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: 'Trip' } });
    fireEvent.click(screen.getByRole('button', { name: /Add dates, description and more/i }));
    fireEvent.change(await screen.findByLabelText(/Start Date/i), { target: { value: '2027-05-10' } });
    fireEvent.change(screen.getByLabelText(/End Date/i), { target: { value: '2027-05-01' } });
    fireEvent.submit(screen.getByLabelText(/^Title/).closest('form') as HTMLFormElement);

    await waitFor(() => expect(screen.getByLabelText(/End Date/i)).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
