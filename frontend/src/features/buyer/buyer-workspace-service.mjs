// Synthetic session only. No legal registration or server reservation is implied.
export function createBuyerWorkspaceService() {
  let state = { version: 1, stage: 'DISCUSSION', buyerDecision: 'PENDING', sellerDecision: 'PROCEED', reserved: true, reason: '', events: ['Request accepted', 'Parcel reserved', 'Seller chose Proceed'] };
  return {
    getSnapshot: () => structuredClone(state),
    decide(decision, version) {
      if (version !== state.version) throw new Error('This transaction changed. Review the latest state.');
      if (state.stage !== 'DISCUSSION') throw new Error('This stage no longer accepts discussion decisions.');
      if (!['PROCEED', 'DISCUSS'].includes(decision)) throw new Error('Choose a valid decision.');
      state.buyerDecision = decision;
      state.events.push(decision === 'PROCEED' ? 'Buyer chose Proceed' : 'Buyer requested further discussion');
      if (decision === 'PROCEED' && state.sellerDecision === 'PROCEED') state.stage = 'AGREEMENT_READY';
      state.version++;
      return this.getSnapshot();
    },
    cancel(reason, version) {
      if (version !== state.version) throw new Error('This transaction changed. Review the latest state.');
      if (state.stage === 'ON_HOLD') throw new Error('A cancellation review is already open.');
      if (!reason?.trim() || reason.trim().length > 2000) throw new Error('Enter a reason between 1 and 2,000 characters.');
      state.reason = reason.trim(); state.stage = 'ON_HOLD'; state.version++;
      state.events.push('Cancellation requested — parcel remains reserved');
      return this.getSnapshot();
    },
  };
}

export const PURCHASE_REQUESTS = [
  { id: 'BR-108', title: 'Bheemili Coastal Plot', location: 'Visakhapatnam, Andhra Pradesh', status: 'Accepted', image: 'coastal-plot.webp', survey: '76/3', area: '300 sq yd', price: '₹60,00,000' },
  { id: 'BR-111', title: 'Anandapuram Farm Plot', location: 'Visakhapatnam, Andhra Pradesh', status: 'Pending', image: 'farm-plot.webp', survey: '82/1', area: '1 acre', price: '₹45,00,000' },
  { id: 'BR-112', title: 'Gajuwaka Residential Plot', location: 'Visakhapatnam, Andhra Pradesh', status: 'Pending', image: 'residential-plot.webp', survey: '43/2', area: '240 sq yd', price: '₹36,00,000' },
  { id: 'BR-107', title: 'Vizianagaram Garden Plot', location: 'Vizianagaram, Andhra Pradesh', status: 'Declined', image: 'farm-plot.webp', survey: '15/8', area: '400 sq yd', price: '₹28,00,000' },
];
