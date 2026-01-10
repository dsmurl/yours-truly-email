import * as api from './api';
import * as ses from './ses';

export const apiUrl = api.apiUrl;
export const sourceEmailIdentity = ses.emailIdentity.email;
export const destinationEmailIdentity = ses.destinationIdentity.email;
