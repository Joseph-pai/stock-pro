export const CONFIG = {
    FINMIND: {
        API_URL: 'https://api.finmindtrade.com/api/v4/data',
        TOKEN: process.env.NEXT_PUBLIC_FINMIND_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJkYXRlIjoiMjAyNS0xMS0yMyAxMDoxODowMSIsInVzZXJfaWQiOiJqb3NlcGhwYWkiLCJpcCI6IjExNC45Mi4yMjUuMTU1In0.oAzIQd5nkYB7TutNAQRXi-V5sd4IRLUvjkRk8FpZ6C4',
    },
    SYSTEM: {
        V_RATIO_THRESHOLD: 3.0,
        MA_ALIGNMENT_THRESHOLD: 0.03, // 3%
        INST_BUY_STREAK: 3, // 3 days
    }
} as const;
