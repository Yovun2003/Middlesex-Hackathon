# NouDilo demonstration

Start `npm run demo`. It opens a loopback-only environment with separate `.noudilo-demo` storage. This script operates actual APIs and saved records in that environment; only the geographic infrastructure, vehicle journey, and symbolic tank level are illustrations. Demo role selection is disabled outside explicit demo mode.

1. Open **Demo roles → Resident**. In the resident workspace, choose **Water shortage**, **No running water**, and continue. Select Curepipe, a duration, and the approximate households. The camera approaches the household and the tap stops. Duration changes the symbolic roof-tank indicator.
2. Review and choose **Send report**. Wait for the saved reference. The confirmation signal starts only after the server acknowledges the report. The initial neighbouring Curepipe report is already reviewed, so this report links to its community incident for coordinator review.
3. Choose **Demo roles → Coordinator**. Open the pending report and verify it. Read the priority reasons. In the incident register, approve an allocation and assign `WT-04`. The camera moves to the depot after confirmation.
4. Choose **Demo roles → Tanker driver**. Accept the assignment, then confirm departure. **Demo route** plays an illustrative trip with a following camera; pause/resume controls work independently of recorded milestones. The route is not GPS or safe navigation guidance.
5. Confirm arrival when parked. Record the actual litres delivered, for example 3,600 rather than the 4,000 approved. This remains unpublished until review.
6. Choose **Coordinator** and approve the delivery update. Choose **Resident**, open **Track my reports**, and find the published delivery. Regular supply is still affected. A separate independently verified restoration is required to mark supply recovered. In Coordinator, open **Confirm regular supply recovery**, record the household check and choose **Verify normal supply**. The resident timeline then shows **Water restored** and the tap runs again.
7. Close tracking. Choose **Demo roles → Neighbour**. Select **Public leak**, **Heavy flow**, and continue. Select Rose Hill, add a road or landmark, and optionally attach a small JPEG, PNG, or WebP photo. The shared world moves to its public pipe cutaway.
8. Review and choose **Send report**. Note that submission does not stop the leak or mark it repaired.
9. Choose **Coordinator**. Verify the report and assign the Central maintenance crew. The world shows the maintenance vehicle and the selected work location.
10. Choose **Maintenance crew**. Start maintenance, record an inspection, describe the work performed, attach evidence, and submit the completed work for verification. The public status remains pending verification.
11. Choose **Coordinator**. Select Rose Hill in **Incident register**, record an independent verification finding, and choose **Verify and publish repair**. The shared world stops the escaping water only at the verified state. If a household supply check also passed, select **I also confirmed water is flowing at the affected home** before publishing. That explicit confirmation records **Water restored** and focuses the running household tap; verifying a repair alone does not claim supply recovery.
12. Open **Island overview**, select **Report a water issue** to open the drawer, choose Rose Hill, and inspect the published verified result. The world canvas has remained mounted throughout the role and route changes.

For a fresh run without deleting previous demo records, use a new directory:

```sh
NOU_DATABASE=sqlite NOU_DEMO=1 NOU_DATA_DIR=/private/tmp/noudilo-demo-fresh npm run dev
```

All reporting actions also work with **2D map**, reduced motion, or WebGL unavailable. Use **Skip camera travel** from the reporting panel to reach the task view immediately. Camera travel can be interrupted by a new task, paused, skipped, or explicitly explored. Drivers should update records only while safely parked.
