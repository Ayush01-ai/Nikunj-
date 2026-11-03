# Boolean()

> God node · 24 connections · [C:\Nikunj\src\frontend\components\orders\DeliveryConfirmForm.tsx](file:///C:/Nikunj/src/frontend/components/orders/DeliveryConfirmForm.tsx#L105)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as Boolean()
    participant P1 as GET()
    participant P2 as POST()
    participant P3 as error
    participant P4 as PATCH()
    participant P5 as catch()
    participant P6 as json
    participant P7 as set()
    participant P8 as push
    participant P9 as from
    participant P10 as connectDB
    participant P11 as notifyOrder()
    participant P12 as now
    participant P13 as assignDelivery()
    participant P14 as verifyDelivery()
    participant P15 as digest()
    participant P16 as findOne
    participant P17 as ensureDeliveryCode()
    participant P18 as settleCashfreeOrder()
    participant P19 as isRateLimited
    participant P20 as isIpLimited
    participant P21 as sanitizePhone()
    participant P22 as findOneAndUpdate
    participant P23 as verifyOrderAccess()
    participant P24 as sanityOrderId()
    participant P25 as withStockLock()
    participant P26 as getSanityOrder()
    participant P27 as resyncOrderToSanity()
    participant P28 as parseAddress()
    participant P29 as text
    participant P30 as dayUpdateFor()
    participant P31 as isClerkConfigured()
    participant P32 as getClerkServerClient()
    participant P33 as getVariantPricing()
    participant P34 as setSanityUpiReference()
    participant P35 as syncMongo()
    participant P36 as requireAuthHybrid
    participant P37 as publicUser()
    participant P38 as lean()
    participant P39 as log()
    participant P40 as setSessionCookie()
    participant P41 as canSubmitPayoutDetails()
    participant P42 as requestEligibility()
    participant P43 as historyEntry()
    participant P44 as updateOne
    participant P45 as processRefund()
    participant P46 as refundView()
    participant P47 as fail()
    participant P48 as isOrderLimited
    participant P49 as validSignature()
    participant P50 as recordDayUpdate()
    participant P51 as syncAdminRole()
    participant P52 as sessionResponse()
    participant P53 as otpMatches()
    participant P54 as isStudioOrSiteAdmin()
    participant P55 as resendDeliveryCode()
    participant P56 as describePayout()
    participant P57 as getAdminSettings()
    participant P58 as daysSinceDelivered()
    participant P59 as verifyPaymentSignature()
    participant P60 as deliveryView()
    participant P61 as notifyCustomerOrderConfirmed()
    participant P62 as buildPaymentResponse()
    participant P63 as getServerSetOrderNote()
    participant P64 as analyticsEnabled()
    participant P65 as parseTrackPayload()
    participant P66 as istDay()
    participant P67 as recordLead()
    participant P68 as ensureUserIndexes()
    participant P69 as isValidPhone()
    participant P70 as isWhatsAppConfigured
    participant P71 as studioCorsHeaders()
    participant P72 as orderTotals()
    participant P73 as deliveryPolicy()
    participant P74 as snapshotForOrder()
    participant P75 as validatePayoutDetails()
    participant P76 as isCashfreeConfigured
    participant P77 as createGuestPaymentProof()
    participant P78 as refundBreakdown()
    participant P79 as isLimited
    participant P80 as clean()
    participant P81 as imageExt()
    participant P82 as key()
    participant P83 as recoverExistingCashfreeOrder()
    participant P84 as providedSecret()
    participant P85 as safeEqual()
    participant P86 as validSecret()
    participant P87 as clientIp()
    participant P88 as normalizeEmail()
    participant P89 as isValidEmail()
    participant P90 as sendWhatsAppOtp
    participant P91 as holdKey()
    participant P92 as pushConfirmedOrderToSanity
    participant P93 as pushAwaitingPaymentOrderToSanity()
    participant P94 as done()
    participant P95 as isLeadRateLimited
    participant P96 as isTokenLimited
    participant P97 as plain()
    participant P98 as initialsOf()
    participant P99 as isOrderCreateLimited
    participant P100 as trustedBaseUrl()
    participant P101 as cashfreeCustomerId()
    participant P102 as isBot()
    participant P103 as comparePassword()
    participant P104 as passwordProblem()
    participant P105 as hashPassword()
    participant P106 as generateOTP()
    participant P107 as isDbConnectionError()
    participant P108 as authorizeOrderForPayment()
    participant P109 as createCashfreeOrder
    participant P110 as verifyCashfreeWebhookSignature
    participant P111 as revalidatePath
    participant P112 as max
    participant P113 as run()
    participant P114 as DELETE()
    participant P115 as verifySanityStudioToken()
    participant P116 as heldQuantities()
    participant P117 as pickDiverse()
    participant P118 as track()
    participant P119 as safeEq()
    participant P120 as isEmailConfigured()
    participant P121 as uploadImageFromUrl()
    participant P122 as getSanityOrders()
    participant P123 as isGoogleConfigured()
    participant P124 as safeEqual()
    participant P125 as getSanityOrderStatuses()
    participant P126 as LegacyProductsPage()
    participant P127 as extractToken()
    participant P128 as summariseDays()
    participant P129 as summariseProducts()
    participant P130 as filterAndSort()
    participant P131 as safeNext()
    participant P132 as siteUrl()
    participant P133 as limit
    participant P134 as hasToken()
    participant P135 as isWhatsAppConfigured()
    participant P136 as getOrLinkMongoUser()
    participant P137 as pinExpired()
    participant P138 as needsChoice()
    participant P139 as saveAddress()
    participant P140 as isPayoutsConfigured()
    participant P141 as hasVerifiedEmail()
    participant P142 as hasVerifiedPhone()
    participant P143 as gatewayErrorMessage()
    participant P144 as refundLocked()
    participant P145 as hasToken()
    participant P146 as isCashfreeConfigured()
    P0->>+ P1: calls
    P1-->>- P0: return
    P1->>+ P2: calls
    P2-->>- P1: return
    P2->>+ P1: calls
    P1-->>- P2: return
    P2->>+ P3: calls
    P3-->>- P2: return
    P2->>+ P4: calls
    P4-->>- P2: return
    P2->>+ P5: calls
    P5-->>- P2: return
    P2->>+ P6: calls
    P6-->>- P2: return
    P2->>+ P7: calls
    P7-->>- P2: return
    P2->>+ P8: calls
    P8-->>- P2: return
    P2->>+ P9: calls
    P9-->>- P2: return
    P2->>+ P10: calls
    P10-->>- P2: return
    P2->>+ P11: calls
    P11-->>- P2: return
    P2->>+ P12: calls
    P12-->>- P2: return
    P2->>+ P13: calls
    P13-->>- P2: return
    P2->>+ P14: calls
    P14-->>- P2: return
    P2->>+ P15: calls
    P15-->>- P2: return
    P2->>+ P16: calls
    P16-->>- P2: return
    P2->>+ P17: calls
    P17-->>- P2: return
    P2->>+ P18: calls
    P18-->>- P2: return
    P2->>+ P19: calls
    P19-->>- P2: return
    P2->>+ P20: calls
    P20-->>- P2: return
    P2->>+ P21: calls
    P21-->>- P2: return
    P2->>+ P22: calls
    P22-->>- P2: return
    P2->>+ P23: calls
    P23-->>- P2: return
    P2->>+ P24: calls
    P24-->>- P2: return
    P2->>+ P25: calls
    P25-->>- P2: return
    P2->>+ P26: calls
    P26-->>- P2: return
    P2->>+ P27: calls
    P27-->>- P2: return
    P2->>+ P28: calls
    P28-->>- P2: return
    P2->>+ P29: calls
    P29-->>- P2: return
    P2->>+ P30: calls
    P30-->>- P2: return
    P2->>+ P31: calls
    P31-->>- P2: return
    P2->>+ P32: calls
    P32-->>- P2: return
    P2->>+ P33: calls
    P33-->>- P2: return
    P2->>+ P34: calls
    P34-->>- P2: return
    P2->>+ P35: calls
    P35-->>- P2: return
    P2->>+ P36: calls
    P36-->>- P2: return
    P2->>+ P37: calls
    P37-->>- P2: return
    P2->>+ P38: calls
    P38-->>- P2: return
    P2->>+ P39: calls
    P39-->>- P2: return
    P2->>+ P40: calls
    P40-->>- P2: return
    P2->>+ P41: calls
    P41-->>- P2: return
    P2->>+ P42: calls
    P42-->>- P2: return
    P2->>+ P43: calls
    P43-->>- P2: return
    P2->>+ P44: calls
    P44-->>- P2: return
    P2->>+ P45: calls
    P45-->>- P2: return
    P2->>+ P46: calls
    P46-->>- P2: return
    P2->>+ P47: calls
    P47-->>- P2: return
    P2->>+ P48: calls
    P48-->>- P2: return
    P2->>+ P49: calls
    P49-->>- P2: return
    P2->>+ P50: calls
    P50-->>- P2: return
    P2->>+ P51: calls
    P51-->>- P2: return
    P2->>+ P52: calls
    P52-->>- P2: return
    P2->>+ P53: calls
    P53-->>- P2: return
    P2->>+ P54: calls
    P54-->>- P2: return
    P2->>+ P55: calls
    P55-->>- P2: return
    P2->>+ P56: calls
    P56-->>- P2: return
    P2->>+ P57: calls
    P57-->>- P2: return
    P2->>+ P58: calls
    P58-->>- P2: return
    P2->>+ P59: calls
    P59-->>- P2: return
    P2->>+ P60: calls
    P60-->>- P2: return
    P2->>+ P61: calls
    P61-->>- P2: return
    P2->>+ P62: calls
    P62-->>- P2: return
    P2->>+ P63: calls
    P63-->>- P2: return
    P2->>+ P64: calls
    P64-->>- P2: return
    P2->>+ P65: calls
    P65-->>- P2: return
    P2->>+ P66: calls
    P66-->>- P2: return
    P2->>+ P67: calls
    P67-->>- P2: return
    P2->>+ P68: calls
    P68-->>- P2: return
    P2->>+ P69: calls
    P69-->>- P2: return
    P2->>+ P70: calls
    P70-->>- P2: return
    P2->>+ P71: calls
    P71-->>- P2: return
    P2->>+ P72: calls
    P72-->>- P2: return
    P2->>+ P73: calls
    P73-->>- P2: return
    P2->>+ P74: calls
    P74-->>- P2: return
    P2->>+ P75: calls
    P75-->>- P2: return
    P2->>+ P76: calls
    P76-->>- P2: return
    P2->>+ P77: calls
    P77-->>- P2: return
    P2->>+ P78: calls
    P78-->>- P2: return
    P2->>+ P79: calls
    P79-->>- P2: return
    P2->>+ P80: calls
    P80-->>- P2: return
    P2->>+ P81: calls
    P81-->>- P2: return
    P2->>+ P82: calls
    P82-->>- P2: return
    P2->>+ P83: calls
    P83-->>- P2: return
    P2->>+ P84: calls
    P84-->>- P2: return
    P2->>+ P85: calls
    P85-->>- P2: return
    P2->>+ P86: calls
    P86-->>- P2: return
    P2->>+ P87: calls
    P87-->>- P2: return
    P2->>+ P88: calls
    P88-->>- P2: return
    P2->>+ P89: calls
    P89-->>- P2: return
    P2->>+ P90: calls
    P90-->>- P2: return
    P2->>+ P91: calls
    P91-->>- P2: return
    P2->>+ P92: calls
    P92-->>- P2: return
    P2->>+ P93: calls
    P93-->>- P2: return
    P2->>+ P94: calls
    P94-->>- P2: return
    P2->>+ P95: calls
    P95-->>- P2: return
    P2->>+ P96: calls
    P96-->>- P2: return
    P2->>+ P97: calls
    P97-->>- P2: return
    P2->>+ P98: calls
    P98-->>- P2: return
    P2->>+ P99: calls
    P99-->>- P2: return
    P2->>+ P100: calls
    P100-->>- P2: return
    P2->>+ P101: calls
    P101-->>- P2: return
    P2->>+ P102: calls
    P102-->>- P2: return
    P2->>+ P103: calls
    P103-->>- P2: return
    P2->>+ P104: calls
    P104-->>- P2: return
    P2->>+ P105: calls
    P105-->>- P2: return
    P2->>+ P106: calls
    P106-->>- P2: return
    P2->>+ P107: calls
    P107-->>- P2: return
    P2->>+ P108: calls
    P108-->>- P2: return
    P2->>+ P109: calls
    P109-->>- P2: return
    P2->>+ P110: calls
    P110-->>- P2: return
    P2->>+ P111: calls
    P111-->>- P2: return
    P1->>+ P3: calls
    P3-->>- P1: return
    P1->>+ P6: calls
    P6-->>- P1: return
    P1->>+ P7: calls
    P7-->>- P1: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P9: calls
    P9-->>- P1: return
    P1->>+ P112: calls
    P112-->>- P1: return
    P1->>+ P10: calls
    P10-->>- P1: return
    P1->>+ P113: calls
    P113-->>- P1: return
    P1->>+ P16: calls
    P16-->>- P1: return
    P1->>+ P114: calls
    P114-->>- P1: return
    P1->>+ P115: calls
    P115-->>- P1: return
    P1->>+ P29: calls
    P29-->>- P1: return
    P1->>+ P31: calls
    P31-->>- P1: return
    P1->>+ P40: calls
    P40-->>- P1: return
    P1->>+ P36: calls
    P36-->>- P1: return
    P1->>+ P37: calls
    P37-->>- P1: return
    P1->>+ P38: calls
    P38-->>- P1: return
    P1->>+ P116: calls
    P116-->>- P1: return
    P1->>+ P117: calls
    P117-->>- P1: return
    P1->>+ P118: calls
    P118-->>- P1: return
    P1->>+ P119: calls
    P119-->>- P1: return
    P1->>+ P47: calls
    P47-->>- P1: return
    P1->>+ P51: calls
    P51-->>- P1: return
    P1->>+ P120: calls
    P120-->>- P1: return
    P1->>+ P57: calls
    P57-->>- P1: return
    P1->>+ P54: calls
    P54-->>- P1: return
    P1->>+ P121: calls
    P121-->>- P1: return
    P1->>+ P68: calls
    P68-->>- P1: return
    P1->>+ P70: calls
    P70-->>- P1: return
    P1->>+ P122: calls
    P122-->>- P1: return
    P1->>+ P71: calls
    P71-->>- P1: return
    P1->>+ P123: calls
    P123-->>- P1: return
    P1->>+ P84: calls
    P84-->>- P1: return
    P1->>+ P124: calls
    P124-->>- P1: return
    P1->>+ P125: calls
    P125-->>- P1: return
    P1->>+ P126: calls
    P126-->>- P1: return
    P1->>+ P127: calls
    P127-->>- P1: return
    P1->>+ P87: calls
    P87-->>- P1: return
    P1->>+ P128: calls
    P128-->>- P1: return
    P1->>+ P129: calls
    P129-->>- P1: return
    P1->>+ P130: calls
    P130-->>- P1: return
    P1->>+ P131: calls
    P131-->>- P1: return
    P1->>+ P132: calls
    P132-->>- P1: return
    P1->>+ P133: calls
    P133-->>- P1: return
    P0->>+ P13: calls
    P13-->>- P0: return
    P0->>+ P114: calls
    P114-->>- P0: return
    P0->>+ P23: calls
    P23-->>- P0: return
    P0->>+ P134: calls
    P134-->>- P0: return
    P0->>+ P115: calls
    P115-->>- P0: return
    P0->>+ P28: calls
    P28-->>- P0: return
    P0->>+ P31: calls
    P31-->>- P0: return
    P0->>+ P135: calls
    P135-->>- P0: return
    P0->>+ P136: calls
    P136-->>- P0: return
    P0->>+ P42: calls
    P42-->>- P0: return
    P0->>+ P137: calls
    P137-->>- P0: return
    P0->>+ P120: calls
    P120-->>- P0: return
    P0->>+ P138: calls
    P138-->>- P0: return
    P0->>+ P139: calls
    P139-->>- P0: return
    P0->>+ P140: calls
    P140-->>- P0: return
    P0->>+ P141: calls
    P141-->>- P0: return
    P0->>+ P142: calls
    P142-->>- P0: return
    P0->>+ P143: calls
    P143-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P123: calls
    P123-->>- P0: return
    P0->>+ P145: calls
    P145-->>- P0: return
    P0->>+ P146: calls
    P146-->>- P0: return
```

## Connections by Relation

### calls
- [[GET()]] `INFERRED`
- [[assignDelivery()]] `INFERRED`
- [[DELETE()]] `INFERRED`
- [[verifyOrderAccess()]] `INFERRED`
- [[hasToken()]] `INFERRED`
- [[verifySanityStudioToken()]] `INFERRED`
- [[parseAddress()]] `INFERRED`
- [[isClerkConfigured()]] `INFERRED`
- [[isWhatsAppConfigured()]] `INFERRED`
- [[getOrLinkMongoUser()]] `INFERRED`
- [[requestEligibility()]] `INFERRED`
- [[pinExpired()]] `INFERRED`
- [[isEmailConfigured()]] `INFERRED`
- [[needsChoice()]] `INFERRED`
- [[saveAddress()]] `INFERRED`
- [[isPayoutsConfigured()]] `INFERRED`
- [[hasVerifiedEmail()]] `INFERRED`
- [[hasVerifiedPhone()]] `INFERRED`
- [[gatewayErrorMessage()]] `INFERRED`
- [[refundLocked()]] `INFERRED`

### contains
- [[DeliveryConfirmForm.tsx]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*