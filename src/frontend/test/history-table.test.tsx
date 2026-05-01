/**
 * @jest-environment jsdom
 */
/* @jsxImportSource react */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HistoryTable } from '../client/history-table.js';

describe('HistoryTable UI Component', () => {
  const mockData = [
    {
      id: 'msg-1',
      sessionId: 'session-test',
      createdAt: new Date().toISOString(),
      success: true,
      payload: { phone: '628123456789', message: 'Hello this is a test' },
    },
    {
      id: 'msg-2',
      sessionId: 'session-test',
      createdAt: new Date().toISOString(),
      success: false,
      payload: { phone: '628987654321', message: 'Second message failing' },
      error: 'Timeout error',
    },
  ];

  it('renders the table correctly with data', () => {
    render(
      <HistoryTable
        data={mockData}
        actionType="message"
        selectedSessionId="session-test"
      />
    );

    // Verify search input
    expect(screen.getByPlaceholderText('Search all columns...')).toBeInTheDocument();

    // Verify headers
    expect(screen.getByText('Waktu')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(screen.getByText('Ringkas')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    // Verify data rows
    expect(screen.getByText('Hello this is a test')).toBeInTheDocument();
    expect(screen.getByText('628123456789')).toBeInTheDocument();
    expect(screen.getByText('sent')).toBeInTheDocument();

    expect(screen.getByText('Second message failing')).toBeInTheDocument();
    expect(screen.getByText('628987654321')).toBeInTheDocument();
    expect(screen.getByText('failed: Timeout error')).toBeInTheDocument();
  });

  it('filters table rows based on search input', () => {
    render(
      <HistoryTable
        data={mockData}
        actionType="message"
        selectedSessionId="session-test"
      />
    );

    const searchInput = screen.getByPlaceholderText('Search all columns...');
    
    fireEvent.change(searchInput, { target: { value: 'Hello' } });

    // Should only show the first message
    expect(screen.getByText('Hello this is a test')).toBeInTheDocument();
    expect(screen.queryByText('Second message failing')).not.toBeInTheDocument();
  });

  it('displays empty state when data is empty', () => {
    render(
      <HistoryTable
        data={[]}
        actionType="message"
        selectedSessionId="session-test"
      />
    );

    expect(screen.getByText('No data found')).toBeInTheDocument();
  });

  it('renders broadcast columns correctly', () => {
    render(
      <HistoryTable
        data={[
            {
                id: 'bc-1',
                sessionId: 'session-test',
                createdAt: new Date().toISOString(),
                success: true,
                payload: { phones: ['6281', '6282'], delayMs: 5000, message: 'Broadcast msg' }
            }
        ]}
        actionType="broadcast"
        selectedSessionId="session-test"
      />
    );

    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Delay')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 phones
    expect(screen.getByText('5')).toBeInTheDocument(); // 5 seconds delay
    expect(screen.getByText('Broadcast msg')).toBeInTheDocument();
  });
});
