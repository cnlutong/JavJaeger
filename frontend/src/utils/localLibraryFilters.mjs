export const matchesVrFilter = (record, mode) => (
    mode === "only" ? record?.is_vr === true : mode === "exclude" ? record?.is_vr !== true : true
);
