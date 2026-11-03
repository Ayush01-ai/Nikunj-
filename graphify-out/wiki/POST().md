# POST()

> God node · 145 connections · [C:\Nikunj\src\app\api\webhooks\whatsapp\route.ts](file:///C:/Nikunj/src/app/api/webhooks/whatsapp/route.ts#L40)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as POST()
    participant P1 as GET()
    participant P2 as error
    participant P3 as PATCH()
    participant P4 as catch()
    participant P5 as run()
    participant P6 as verifyDelivery()
    participant P7 as sendApproved()
    participant P8 as pushOrderToSanity()
    participant P9 as requireAuthHybrid()
    participant P10 as sendDeliveryCode()
    participant P11 as recordOutcome()
    participant P12 as DELETE()
    participant P13 as settleCashfreeOrder()
    participant P14 as recordOrderPlaced()
    participant P15 as verifyOrderAccess()
    participant P16 as sendOrderWhatsApp()
    participant P17 as reconcileCashfreePayment()
    participant P18 as getSanityOrder()
    participant P19 as resyncOrderToSanity()
    participant P20 as withStockLock()
    participant P21 as sendDeliveryOtpWhatsApp()
    participant P22 as run()
    participant P23 as failApproved()
    participant P24 as setSanityUpiReference()
    participant P25 as sendWhatsAppOtp()
    participant P26 as addToCart()
    participant P27 as heldQuantities()
    participant P28 as sanityFetch()
    participant P29 as placeOrder()
    participant P30 as handleAddToCart()
    participant P31 as sendEmail()
    participant P32 as notifyCustomerOrderConfirmed()
    participant P33 as saveAddress()
    participant P34 as getServerSetOrderNote()
    participant P35 as validateCoupon()
    participant P36 as sendOtp()
    participant P37 as getSanityOrders()
    participant P38 as releaseStockHold()
    participant P39 as saveProfile()
    participant P40 as deleteAddress()
    participant P41 as setDefaultAddress()
    participant P42 as handleSubmit()
    participant P43 as onRequestError()
    participant P44 as json
    participant P45 as set()
    participant P46 as Boolean()
    participant P47 as from
    participant P48 as max
    participant P49 as connectDB
    participant P50 as findOne
    participant P51 as verifySanityStudioToken()
    participant P52 as text
    participant P53 as isClerkConfigured()
    participant P54 as setSessionCookie()
    participant P55 as requireAuthHybrid
    participant P56 as publicUser()
    participant P57 as lean()
    participant P58 as pickDiverse()
    participant P59 as track()
    participant P60 as safeEq()
    participant P61 as fail()
    participant P62 as syncAdminRole()
    participant P63 as isEmailConfigured()
    participant P64 as getAdminSettings()
    participant P65 as isStudioOrSiteAdmin()
    participant P66 as uploadImageFromUrl()
    participant P67 as ensureUserIndexes()
    participant P68 as isWhatsAppConfigured
    participant P69 as studioCorsHeaders()
    participant P70 as isGoogleConfigured()
    participant P71 as providedSecret()
    participant P72 as safeEqual()
    participant P73 as getSanityOrderStatuses()
    participant P74 as LegacyProductsPage()
    participant P75 as extractToken()
    participant P76 as clientIp()
    participant P77 as summariseDays()
    participant P78 as summariseProducts()
    participant P79 as filterAndSort()
    participant P80 as safeNext()
    participant P81 as siteUrl()
    participant P82 as limit
    participant P83 as push
    participant P84 as notifyOrder()
    participant P85 as now
    participant P86 as assignDelivery()
    participant P87 as digest()
    participant P88 as ensureDeliveryCode()
    participant P89 as isRateLimited
    participant P90 as isIpLimited
    participant P91 as sanitizePhone()
    participant P92 as findOneAndUpdate
    participant P93 as sanityOrderId()
    participant P94 as parseAddress()
    participant P95 as dayUpdateFor()
    participant P96 as getClerkServerClient()
    participant P97 as getVariantPricing()
    participant P98 as syncMongo()
    participant P99 as log()
    participant P100 as canSubmitPayoutDetails()
    participant P101 as requestEligibility()
    participant P102 as historyEntry()
    participant P103 as updateOne
    participant P104 as processRefund()
    participant P105 as refundView()
    participant P106 as isOrderLimited
    participant P107 as validSignature()
    participant P108 as recordDayUpdate()
    participant P109 as sessionResponse()
    participant P110 as otpMatches()
    participant P111 as resendDeliveryCode()
    participant P112 as describePayout()
    participant P113 as daysSinceDelivered()
    participant P114 as verifyPaymentSignature()
    participant P115 as deliveryView()
    participant P116 as buildPaymentResponse()
    participant P117 as analyticsEnabled()
    participant P118 as parseTrackPayload()
    participant P119 as istDay()
    participant P120 as recordLead()
    participant P121 as isValidPhone()
    participant P122 as orderTotals()
    participant P123 as deliveryPolicy()
    participant P124 as snapshotForOrder()
    participant P125 as validatePayoutDetails()
    participant P126 as isCashfreeConfigured
    participant P127 as createGuestPaymentProof()
    participant P128 as refundBreakdown()
    participant P129 as isLimited
    participant P130 as clean()
    participant P131 as imageExt()
    participant P132 as key()
    participant P133 as recoverExistingCashfreeOrder()
    participant P134 as safeEqual()
    participant P135 as validSecret()
    participant P136 as normalizeEmail()
    participant P137 as isValidEmail()
    participant P138 as sendWhatsAppOtp
    participant P139 as holdKey()
    participant P140 as pushConfirmedOrderToSanity
    participant P141 as pushAwaitingPaymentOrderToSanity()
    participant P142 as done()
    participant P143 as isLeadRateLimited
    participant P144 as isTokenLimited
    participant P145 as plain()
    participant P146 as initialsOf()
    participant P147 as isOrderCreateLimited
    participant P148 as trustedBaseUrl()
    participant P149 as cashfreeCustomerId()
    participant P150 as isBot()
    participant P151 as comparePassword()
    participant P152 as passwordProblem()
    participant P153 as hashPassword()
    participant P154 as generateOTP()
    participant P155 as isDbConnectionError()
    participant P156 as authorizeOrderForPayment()
    participant P157 as createCashfreeOrder
    participant P158 as verifyCashfreeWebhookSignature
    participant P159 as revalidatePath
    P0->>+ P1: calls
    P1-->>- P0: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P2: calls
    P2-->>- P1: return
    P2->>+ P0: calls
    P0-->>- P2: return
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
    P1->>+ P44: calls
    P44-->>- P1: return
    P1->>+ P45: calls
    P45-->>- P1: return
    P1->>+ P46: calls
    P46-->>- P1: return
    P1->>+ P47: calls
    P47-->>- P1: return
    P1->>+ P48: calls
    P48-->>- P1: return
    P1->>+ P49: calls
    P49-->>- P1: return
    P1->>+ P5: calls
    P5-->>- P1: return
    P1->>+ P50: calls
    P50-->>- P1: return
    P1->>+ P12: calls
    P12-->>- P1: return
    P1->>+ P51: calls
    P51-->>- P1: return
    P1->>+ P52: calls
    P52-->>- P1: return
    P1->>+ P53: calls
    P53-->>- P1: return
    P1->>+ P54: calls
    P54-->>- P1: return
    P1->>+ P55: calls
    P55-->>- P1: return
    P1->>+ P56: calls
    P56-->>- P1: return
    P1->>+ P57: calls
    P57-->>- P1: return
    P1->>+ P27: calls
    P27-->>- P1: return
    P1->>+ P58: calls
    P58-->>- P1: return
    P1->>+ P59: calls
    P59-->>- P1: return
    P1->>+ P60: calls
    P60-->>- P1: return
    P1->>+ P61: calls
    P61-->>- P1: return
    P1->>+ P62: calls
    P62-->>- P1: return
    P1->>+ P63: calls
    P63-->>- P1: return
    P1->>+ P64: calls
    P64-->>- P1: return
    P1->>+ P65: calls
    P65-->>- P1: return
    P1->>+ P66: calls
    P66-->>- P1: return
    P1->>+ P67: calls
    P67-->>- P1: return
    P1->>+ P68: calls
    P68-->>- P1: return
    P1->>+ P37: calls
    P37-->>- P1: return
    P1->>+ P69: calls
    P69-->>- P1: return
    P1->>+ P70: calls
    P70-->>- P1: return
    P1->>+ P71: calls
    P71-->>- P1: return
    P1->>+ P72: calls
    P72-->>- P1: return
    P1->>+ P73: calls
    P73-->>- P1: return
    P1->>+ P74: calls
    P74-->>- P1: return
    P1->>+ P75: calls
    P75-->>- P1: return
    P1->>+ P76: calls
    P76-->>- P1: return
    P1->>+ P77: calls
    P77-->>- P1: return
    P1->>+ P78: calls
    P78-->>- P1: return
    P1->>+ P79: calls
    P79-->>- P1: return
    P1->>+ P80: calls
    P80-->>- P1: return
    P1->>+ P81: calls
    P81-->>- P1: return
    P1->>+ P82: calls
    P82-->>- P1: return
    P0->>+ P2: calls
    P2-->>- P0: return
    P0->>+ P3: calls
    P3-->>- P0: return
    P0->>+ P4: calls
    P4-->>- P0: return
    P0->>+ P44: calls
    P44-->>- P0: return
    P0->>+ P45: calls
    P45-->>- P0: return
    P0->>+ P83: calls
    P83-->>- P0: return
    P0->>+ P47: calls
    P47-->>- P0: return
    P0->>+ P49: calls
    P49-->>- P0: return
    P0->>+ P84: calls
    P84-->>- P0: return
    P0->>+ P85: calls
    P85-->>- P0: return
    P0->>+ P86: calls
    P86-->>- P0: return
    P0->>+ P6: calls
    P6-->>- P0: return
    P0->>+ P87: calls
    P87-->>- P0: return
    P0->>+ P50: calls
    P50-->>- P0: return
    P0->>+ P88: calls
    P88-->>- P0: return
    P0->>+ P13: calls
    P13-->>- P0: return
    P0->>+ P89: calls
    P89-->>- P0: return
    P0->>+ P90: calls
    P90-->>- P0: return
    P0->>+ P91: calls
    P91-->>- P0: return
    P0->>+ P92: calls
    P92-->>- P0: return
    P0->>+ P15: calls
    P15-->>- P0: return
    P0->>+ P93: calls
    P93-->>- P0: return
    P0->>+ P20: calls
    P20-->>- P0: return
    P0->>+ P18: calls
    P18-->>- P0: return
    P0->>+ P19: calls
    P19-->>- P0: return
    P0->>+ P94: calls
    P94-->>- P0: return
    P0->>+ P52: calls
    P52-->>- P0: return
    P0->>+ P95: calls
    P95-->>- P0: return
    P0->>+ P53: calls
    P53-->>- P0: return
    P0->>+ P96: calls
    P96-->>- P0: return
    P0->>+ P97: calls
    P97-->>- P0: return
    P0->>+ P24: calls
    P24-->>- P0: return
    P0->>+ P98: calls
    P98-->>- P0: return
    P0->>+ P55: calls
    P55-->>- P0: return
    P0->>+ P56: calls
    P56-->>- P0: return
    P0->>+ P57: calls
    P57-->>- P0: return
    P0->>+ P99: calls
    P99-->>- P0: return
    P0->>+ P54: calls
    P54-->>- P0: return
    P0->>+ P100: calls
    P100-->>- P0: return
    P0->>+ P101: calls
    P101-->>- P0: return
    P0->>+ P102: calls
    P102-->>- P0: return
    P0->>+ P103: calls
    P103-->>- P0: return
    P0->>+ P104: calls
    P104-->>- P0: return
    P0->>+ P105: calls
    P105-->>- P0: return
    P0->>+ P61: calls
    P61-->>- P0: return
    P0->>+ P106: calls
    P106-->>- P0: return
    P0->>+ P107: calls
    P107-->>- P0: return
    P0->>+ P108: calls
    P108-->>- P0: return
    P0->>+ P62: calls
    P62-->>- P0: return
    P0->>+ P109: calls
    P109-->>- P0: return
    P0->>+ P110: calls
    P110-->>- P0: return
    P0->>+ P65: calls
    P65-->>- P0: return
    P0->>+ P111: calls
    P111-->>- P0: return
    P0->>+ P112: calls
    P112-->>- P0: return
    P0->>+ P64: calls
    P64-->>- P0: return
    P0->>+ P113: calls
    P113-->>- P0: return
    P0->>+ P114: calls
    P114-->>- P0: return
    P0->>+ P115: calls
    P115-->>- P0: return
    P0->>+ P32: calls
    P32-->>- P0: return
    P0->>+ P116: calls
    P116-->>- P0: return
    P0->>+ P34: calls
    P34-->>- P0: return
    P0->>+ P117: calls
    P117-->>- P0: return
    P0->>+ P118: calls
    P118-->>- P0: return
    P0->>+ P119: calls
    P119-->>- P0: return
    P0->>+ P120: calls
    P120-->>- P0: return
    P0->>+ P67: calls
    P67-->>- P0: return
    P0->>+ P121: calls
    P121-->>- P0: return
    P0->>+ P68: calls
    P68-->>- P0: return
    P0->>+ P69: calls
    P69-->>- P0: return
    P0->>+ P122: calls
    P122-->>- P0: return
    P0->>+ P123: calls
    P123-->>- P0: return
    P0->>+ P124: calls
    P124-->>- P0: return
    P0->>+ P125: calls
    P125-->>- P0: return
    P0->>+ P126: calls
    P126-->>- P0: return
    P0->>+ P127: calls
    P127-->>- P0: return
    P0->>+ P128: calls
    P128-->>- P0: return
    P0->>+ P129: calls
    P129-->>- P0: return
    P0->>+ P130: calls
    P130-->>- P0: return
    P0->>+ P131: calls
    P131-->>- P0: return
    P0->>+ P132: calls
    P132-->>- P0: return
    P0->>+ P133: calls
    P133-->>- P0: return
    P0->>+ P71: calls
    P71-->>- P0: return
    P0->>+ P134: calls
    P134-->>- P0: return
    P0->>+ P135: calls
    P135-->>- P0: return
    P0->>+ P76: calls
    P76-->>- P0: return
    P0->>+ P136: calls
    P136-->>- P0: return
    P0->>+ P137: calls
    P137-->>- P0: return
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
    P0->>+ P145: calls
    P145-->>- P0: return
    P0->>+ P146: calls
    P146-->>- P0: return
    P0->>+ P147: calls
    P147-->>- P0: return
    P0->>+ P148: calls
    P148-->>- P0: return
    P0->>+ P149: calls
    P149-->>- P0: return
    P0->>+ P150: calls
    P150-->>- P0: return
    P0->>+ P151: calls
    P151-->>- P0: return
    P0->>+ P152: calls
    P152-->>- P0: return
    P0->>+ P153: calls
    P153-->>- P0: return
    P0->>+ P154: calls
    P154-->>- P0: return
    P0->>+ P155: calls
    P155-->>- P0: return
    P0->>+ P156: calls
    P156-->>- P0: return
    P0->>+ P157: calls
    P157-->>- P0: return
    P0->>+ P158: calls
    P158-->>- P0: return
    P0->>+ P159: calls
    P159-->>- P0: return
```

## Connections by Relation

### QUERIES_MODEL
- [[Order]] `EXTRACTED`
- [[User]] `EXTRACTED`
- [[Otp]] `EXTRACTED`

### calls
- [[GET()]] `EXTRACTED`
- [[error]] `INFERRED`
- [[PATCH()]] `INFERRED`
- [[catch()]] `INFERRED`
- [[json]] `INFERRED`
- [[set()]] `INFERRED`
- [[push]] `INFERRED`
- [[from]] `INFERRED`
- [[connectDB]] `INFERRED`
- [[notifyOrder()]] `INFERRED`
- [[now]] `INFERRED`
- [[assignDelivery()]] `INFERRED`
- [[verifyDelivery()]] `INFERRED`
- [[digest()]] `INFERRED`
- [[findOne]] `INFERRED`
- [[ensureDeliveryCode()]] `INFERRED`
- [[settleCashfreeOrder()]] `INFERRED`
- [[isRateLimited]] `EXTRACTED`
- [[isIpLimited]] `EXTRACTED`
- [[sanitizePhone()]] `INFERRED`

### contains
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*