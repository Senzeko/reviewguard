import { describe, it, expect } from 'vitest';
import axios from 'axios';
import { getUserFacingApiError } from './userFacingError';
import { HTTP_TIMEOUT_USER_MESSAGE } from './httpPolicy';

describe('getUserFacingApiError', () => {
  it('uses API error body when present', () => {
    const err = new axios.AxiosError('fail');
    err.response = {
      status: 400,
      statusText: 'Bad Request',
      data: { error: 'Bad input' },
      headers: {},
      config: {} as never,
    };
    expect(getUserFacingApiError(err, 'fallback')).toBe('Bad input');
  });

  it('uses axios message when no response body (e.g. timeout after annotateTimeout)', () => {
    const err = new axios.AxiosError(HTTP_TIMEOUT_USER_MESSAGE);
    err.code = 'ECONNABORTED';
    expect(getUserFacingApiError(err, 'fallback')).toBe(HTTP_TIMEOUT_USER_MESSAGE);
  });

  it('maps 502 gateway responses to actionable copy', () => {
    const err = new axios.AxiosError('Request failed with status code 502');
    err.response = {
      status: 502,
      statusText: 'Bad Gateway',
      data: {},
      headers: {},
      config: {} as never,
    };
    expect(getUserFacingApiError(err, 'fallback')).toContain('API server');
  });

  it('maps ERR_NETWORK to actionable copy', () => {
    const err = new axios.AxiosError('Network Error');
    err.code = 'ERR_NETWORK';
    expect(getUserFacingApiError(err, 'fallback')).toContain('API server');
  });
});
