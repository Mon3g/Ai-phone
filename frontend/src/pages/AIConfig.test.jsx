import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AIConfig from './AIConfig';
import { supabase } from '../lib/supabase';

// Mock the supabase client
vi.mock('../lib/supabase');

describe('AIConfig', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should update the UI correctly when deactivating a configuration', async () => {
    // --- ARRANGE ---
    // Mock the initial fetch to return an active configuration
    const mockActiveConfig = {
      id: 'config-1',
      is_active: true,
      name: 'Test Config',
      system_message: 'Test message',
      voice: 'alloy',
      temperature: 0.5,
      initial_greeting: 'Hi',
      enable_greeting: true,
    };

    const from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockActiveConfig, error: null }),
                }),
            }),
        }),
        update: vi.fn().mockImplementation(updatedConfig => ({
            eq: vi.fn().mockResolvedValue({ data: [updatedConfig], error: null }),
        })),
    });

    supabase.from = from;
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });


    render(<AIConfig />);

    // Wait for the component to fetch and display the initial data
    const activeCheckbox = await screen.findByRole('checkbox', { name: /Set as Active Configuration/i });
    expect(activeCheckbox.checked).toBe(true);


    // --- ACT ---
    // Simulate the user unchecking the "active" checkbox
    fireEvent.click(activeCheckbox);
    expect(activeCheckbox.checked).toBe(false); // Verify state updates before save

    // Simulate saving the changes
    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveButton);

    // --- ASSERT ---
    // Wait for the "Saving..." state to clear and then assert the final state
    await waitFor(() => {
        expect(screen.queryByText(/Saving.../i)).not.toBeInTheDocument();
    });

    // **This is the core of the bug fix verification.**
    // The checkbox should remain unchecked because we are not re-fetching the (now inactive)
    // config from the database. The component's state should reflect the user's last action.
    expect(activeCheckbox.checked).toBe(false);

    // Verify that supabase.from('...').update was called with is_active: false
    expect(supabase.from).toHaveBeenCalledWith('assistant_settings');
    const updateCall = supabase.from().update.mock.calls[0][0];
    expect(updateCall.is_active).toBe(false);
  });
});