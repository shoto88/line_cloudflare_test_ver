import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
function getStatusMessage(waitingNumber: number, currentNumber: number, averageTime: number): any[] {
  const estimatedWaitingTime = (waitingNumber - currentNumber) * averageTime;
  
  const now = new Date();
  const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const estimatedTime = new Date(japanTime.getTime() + estimatedWaitingTime * 60000);
  
  const estimatedTimeString = format(estimatedTime, "HH:mm", { locale: ja });
  const estimatedMinutesString = `(約${Math.round(estimatedWaitingTime)}分後)`;

  
    const flexMessage = {
      "type": "flex",
      "altText": "現在の待ち状況",
      "contents": {
        "type": "bubble",
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": "現在の待ち状況",
              "weight": "bold",
              "size": "xl",
              "margin": "md"
            },
            {
              "type": "box",
              "layout": "vertical",
              "margin": "xxl",
              "spacing": "sm",
              "contents": [
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "text",
                      "text": "発券済番号",
                      "size": "sm",
                      "color": "#555555",
                      "flex": 0
                    },
                    {
                      "type": "text",
                      "text": String(waitingNumber),
                      "size": "sm",
                      "color": "#111111",
                      "align": "end"
                    }
                  ]
                },
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "text",
                      "text": "診察済み組数",
                      "size": "sm",
                      "color": "#555555",
                      "flex": 0
                    },
                    {
                      "type": "text",
                      "text": String(currentNumber),
                      "size": "sm",
                      "color": "#111111",
                      "align": "end"
                    }
                  ]
                },
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "text",
                      "text": "今現在の待ち時間目安",
                      "size": "sm",
                      "color": "#555555",
                      "flex": 0
                    },
                    {
                      "type": "text",
                      "text": estimatedTimeString + " " + estimatedMinutesString,
                      "size": "sm",
                      "color": "#111111",
                      "align": "end"
                    }
                  ]
                }
              ]
            },
            {
              "type": "separator",
              "margin": "xl"
            },
            {
              "type": "box",
"layout": "vertical",
"margin": "xl",
"contents": [
  {
    "type": "text",
    "text": "月2回、日曜日診療しています(10時〜15時)\n次回の日曜診療日：9月8日,8月29日",
    "size": "xs",
    "color": "#0000ff",
    "wrap": true
  }
]
            }
          ]
        }
      }
    };
    return [flexMessage];
  }  // ... (GASのgetStatusMessage関数の中身をコピー)

// function getStatusMessage(waitingNumber: number, currentNumber: number, averageTime: number): any[] {
//   const waitingGroups = waitingNumber - currentNumber;
//   const estimatedWaitingTime = waitingGroups * averageTime;
  
//   const now = new Date();
//   const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
//   const estimatedTime = new Date(japanTime.getTime() + estimatedWaitingTime * 60000);
  
//   const estimatedTimeString = format(estimatedTime, "HH:mm", { locale: ja });
//   const estimatedMinutesString = `約${Math.round(estimatedWaitingTime)}分`;

//   const flexMessage = {
//     "type": "flex",
//     "altText": "現在の待ち状況",
//     "contents": {
//       "type": "bubble",
//       "body": {
//         "type": "box",
//         "layout": "vertical",
//         "contents": [
//           {
//             "type": "text",
//             "text": "現在の待ち状況",
//             "weight": "bold",
//             "size": "xl",
//             "margin": "md"
//           },
//           {
//             "type": "box",
//             "layout": "vertical",
//             "margin": "xxl",
//             "spacing": "sm",
//             "contents": [
//               {
//                 "type": "box",
//                 "layout": "horizontal",
//                 "contents": [
//                   {
//                     "type": "text",
//                     "text": "待ち組数",
//                     "size": "sm",
//                     "color": "#555555",
//                     "flex": 0
//                   },
//                   {
//                     "type": "text",
//                     "text": `${waitingGroups}組`,
//                     "size": "sm",
//                     "color": "#111111",
//                     "align": "end"
//                   }
//                 ]
//               },
//               {
//                 "type": "box",
//                 "layout": "horizontal",
//                 "contents": [
//                   {
//                     "type": "text",
//                     "text": "およその待ち時間",
//                     "size": "sm",
//                     "color": "#555555",
//                     "flex": 0
//                   },
//                   {
//                     "type": "text",
//                     "text": estimatedMinutesString,
//                     "size": "sm",
//                     "color": "#111111",
//                     "align": "end"
//                   }
//                 ]
//               }
//             ]
//           },
//           {
//             "type": "box",
//             "layout": "vertical",
//             "margin": "xxl",
//             "contents": [
//               {
//                 "type": "text",
//                 "text": "実際の順番予約の発券が可能となるのは\n今週中の開始を予定しております。🙇‍♂️\n本日も混雑状況は随時更新しておりますので、\n来院の目安にご利用ください🙇‍♂️",
//                 "size": "xs",
//                 "color": "#aaaaaa",
//                 "wrap": true
//               }
//             ]
//           }
//         ]
//       }
//     }
//   };
//   return [flexMessage];
// }

function getTicketMessage(waitingNumber: number, currentNumber: number, averageTime: number): any[] {
  const yourNumber = (waitingNumber + 1);
  const waitingGroups = waitingNumber - currentNumber;
  const estimatedWaitingTime = waitingGroups * averageTime;

  const flexMessage = {
    "type": "flex",
    "altText": "発券メッセージ",
    "contents": {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": `現在の待ち状況（${waitingGroups}組待ち）`,
            "weight": "bold",
            "size": "xl",
            "margin": "md",
            "wrap": true,
            "contents": [
              {
                "type": "span",
                "text": "現在の待ち状況"
              },
              {
                "type": "span",
                "text": `（${waitingGroups}組待ち）`,
                "size": "md",
                "color": "#00bfff"
              }
            ]
          },
          {
            "type": "text",
            "text": `現在、${waitingNumber}番目まで発券済みです。`,
            "wrap": true,
            "margin": "md"
          },
          {
            "type": "text",
            "text": `今発券すると約${Math.round(estimatedWaitingTime)}分後に順番です。`,
            "wrap": true,
            "margin": "sm",
          },
          {
            "type": "separator",
            "margin": "xl"
          },
          // {
          //   "type": "text",
          //   "text": `あなたの番号は、${yourNumber}番になります。`,
          //   "wrap": true,
          //   "margin": "md"
          // },
          {
            "type": "text",
            "text": "予約券を発券しますか？",
            "wrap": true,
            "margin": "md"
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "spacing": "sm",
        "contents": [
          {
            "type": "button",
            "style": "link",
            "height": "sm",
            "action": {
              "type": "message",
              "label": "発券する",
              "text": "発券"
            }
          },
          {
            "type": "button",
            "style": "link",
            "height": "sm",
            "action": {
              "type": "message",
              "label": "発券しない",
              "text": "キャンセル"
            }
          },
          {
            "type": "spacer",
            "size": "sm"
          }
        ],
        "flex": 0
      }
    }
  };

  return [flexMessage];
}
  function getTicketConfirmationMessage(ticketNumber: number): any[] {
    const flexMessage = {
      type: "flex",
      altText: "発券完了",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "受付時『番号表示』を押し",
              weight: "bold",
              size: "lg",
              margin: "md",
              align: "center",
              contents: [
                {
                  type: "span",
                  text: "受付時"
                },
                {
                  type: "span",
                  text: "『番号表示』",
                  size: "xl",
                  color: "#ff3131"
                },
                {
                  type: "span",
                  text: "を押し"
                }
              ]
            },
            {
              type: "text",
              text: "発券番号をご提示ください🙇‍♂️",
              weight: "bold",
              size: "lg",
              margin: "md",
              align: "center",
            },
            {
              type: "text",
              text: String(ticketNumber),
              weight: "bold",
              size: "4xl",
              margin: "md",
              align: "center",
            },
            {
              type: "separator",
              margin: "lg",
            },
            {
              type: "box",
              layout: "vertical",
              margin: "md",
              spacing: "sm",
              contents: [

                {
                  type: "text",
                  text: "・来院前にメルプの記入を必ずお願いします",
                  size: "xs",
                  color: "#ff0000",
                  wrap: true,
                },
                {
                  type: "text",
                  text: "・記入済みの方は記入しなくて大丈夫です",
                  size: "xs",
                  color: "#FAA0A0",
                  wrap: true,
                },
                {
                  type: "text",
                  text: "・『待ち番号一覧』で随時確認できます",
                  size: "xs",
                  color: "#aaaaaa",
                  wrap: true,
                },
              ],
            },
          ],
        },
      },
    };
  
    return [flexMessage];
  }
  
  function getWaitingTimeMessage(ticketNumber: number, waitingNumber: number, currentNumber: number, averageTime: number): any[] {
    const estimatedWaitingTime = (ticketNumber - currentNumber) * averageTime;
    const now = new Date();
    const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const estimatedTime = new Date(japanTime.getTime() + estimatedWaitingTime * 60000);
    
    const estimatedTimeString = format(estimatedTime, "HH:mm", { locale: ja });
    const estimatedMinutesString = `(約${Math.round(estimatedWaitingTime)}分後)`;
  
    const flexMessage = {
      type: "flex",
      altText: "待ち時間",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "待ち時間",
              weight: "bold",
              size: "xl",
              margin: "md",
            },
            {
              type: "box",
              layout: "vertical",
              margin: "xxl",
              spacing: "sm",
              contents: [
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      text: "発券済番号",
                      size: "sm",
                      color: "#555555",
                      flex: 0,
                    },
                    {
                      type: "text",
                      text: String(waitingNumber),
                      size: "sm",
                      color: "#111111",
                      align: "end",
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      text: "診察済み組数",
                      size: "sm",
                      color: "#555555",
                      flex: 0,
                    },
                    {
                      type: "text",
                      text: String(currentNumber),
                      size: "sm",
                      color: "#111111",
                      align: "end",
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      text: "あなたの番号",
                      size: "sm",
                      color: "#555555",
                      flex: 0,
                    },
                    {
                      type: "text",
                      text: String(ticketNumber),
                      size: "sm",
                      color: "#111111",
                      align: "end",
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      text: "予想診療時刻",
                      size: "sm",
                      color: "#555555",
                      flex: 0,
                    },
                    {
                      type: "text",
                      text: estimatedTimeString + " " + estimatedMinutesString,
                      size: "sm",
                      color: "#111111",
                      align: "end",
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    };
    return [flexMessage];
  }
  function getHoursMessage(): any[] {
    const flexMessage = {
      "type": "flex",
      "altText": "利用時間と次回日曜診療日",
      "contents": {
        "type": "bubble",
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": "現在システム利用時間外です🙇‍♂️",
              "weight": "bold",
              "size": "md",
              "color": "#ff0000",
              "wrap": true
            },
            {
              "type": "text",
              "text": "LINE予約システム利用時間",
              "weight": "bold",
              "size": "md",
              "margin": "md"
            },
            {
              "type": "box",
              "layout": "vertical",
              "margin": "lg",
              "spacing": "sm",
              "contents": [
                {
                  "type": "box",
                  "layout": "baseline",
                  "spacing": "sm",
                  "contents": [
                    {
                      "type": "text",
                      "text": "平日",
                      "color": "#555555",
                      "size": "sm",
                      "flex": 1
                    },
                    {
                      "type": "text",
                      "text": "00:00〜12:20 (午前)\n13:20〜18:20 (午後)",
                      "wrap": true,
                      "color": "#111111",
                      "size": "sm",
                      "flex": 2
                    }
                  ]
                },
                {
                  "type": "box",
                  "layout": "baseline",
                  "spacing": "sm",
                  "contents": [
                    {
                      "type": "text",
                      "text": "土曜日",
                      "color": "#555555",
                      "size": "sm",
                      "flex": 1
                    },
                    {
                      "type": "text",
                      "text": "00:00〜14:40",
                      "wrap": true,
                      "color": "#111111",
                      "size": "sm",
                      "flex": 2
                    }
                  ]
                },
                {
                  "type": "box",
                  "layout": "baseline",
                  "spacing": "sm",
                  "contents": [
                    {
                      "type": "text",
                      "text": "日曜診療日",
                      "color": "#555555",
                      "size": "sm",
                      "flex": 1
                    },
                    {
                      "type": "text",
                      "text": "00:00〜14:40",
                      "wrap": true,
                      "color": "#111111",
                      "size": "sm",
                      "flex": 2
                    }
                  ]
                }
              ]
            },

            {
              "type": "text",
              "text": "次回日曜診療日：9月8日,9月29日",
              "size": "sm",
              "weight": "bold",
              "color": "#0000ff",
              "margin": "lg"
            }
          ]
        }
      }
    };
    return [flexMessage];
  }
  
function getHolidayMessage(): any[] {
    const flexMessage = {
      "type": "flex",
      "altText": "休診日のお知らせ",
      "contents": {
        "type": "bubble",
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": "休診日のお知らせ",
              "weight": "bold",
              "size": "xl",
              "margin": "md"
            },
            {
              "type": "text",
              "text": "本日は休診日です。\n予約券の発券はできません。",
              "wrap": true,
              "margin": "md"
            },
            {
              "type": "separator",
              "margin": "xxl"
            },
            {
              "type": "box",
              "layout": "vertical",
              "margin": "md",
              "contents": [
                {
                  "type": "text",
                  "text": "システム利用時間",
                  "size": "md",
                  "weight": "bold",
                  "margin": "md"
                },
                {
                  "type": "box",
                  "layout": "vertical",
                  "margin": "lg",
                  "spacing": "sm",
                  "contents": [
                    {
                      "type": "box",
                      "layout": "baseline",
                      "spacing": "sm",
                      "contents": [
                        {
                          "type": "text",
                          "text": "月曜~金曜",
                          "color": "#aaaaaa",
                          "size": "sm",
                          "flex": 1
                        },
                        {
                          "type": "text",
                          "text": "00:00 - 12:20 / 13:20 - 18:20",
                          "wrap": true,
                          "color": "#666666",
                          "size": "sm",
                          "flex": 4
                        }
                      ]
                    },
                    {
                      "type": "box",
                      "layout": "baseline",
                      "spacing": "sm",
                      "contents": [
                        {
                          "type": "text",
                          "text": "土曜",
                          "color": "#aaaaaa",
                          "size": "sm",
                          "flex": 1
                        },
                        {
                          "type": "text",
                          "text": "00:00 - 14:40",
                          "wrap": true,
                          "color": "#666666",
                          "size": "sm",
                          "flex": 4
                        }
                      ]
                    },
                    {
                      "type": "box",
                      "layout": "baseline",
                      "spacing": "sm",
                      "contents": [
                        {
                          "type": "text",
                          "text": "日曜・祝日",
                          "color": "#aaaaaa",
                          "size": "sm",
                          "flex": 1
                        },
                        {
                          "type": "text",
                          "text": "休診",
                          "wrap": true,
                          "color": "#666666",
                          "size": "sm",
                          "flex": 4
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    };
    return [flexMessage];
  }
  
function getWaitingNumbersMessage(waitingNumbers: number[]): any[] {
  const columns = 5; // 1行あたりの列数
  const rows = Math.ceil(waitingNumbers.length / columns);
  
  const flexMessage = {
    "type": "flex",
    "altText": "待ち番号一覧",
    "contents": {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "現在の待ち番号一覧",
            "weight": "bold",
            "size": "xl",
            "margin": "md",
            "align": "center"
          },
          {
            "type": "box",
            "layout": "vertical",
            "margin": "lg",
            "spacing": "sm",
            "contents": Array.from({ length: rows }, (_, rowIndex) => ({
              "type": "box",
              "layout": "horizontal",
              "spacing": "sm",
              "contents": Array.from({ length: columns }, (_, colIndex) => {
                const index = rowIndex * columns + colIndex;
                return index < waitingNumbers.length ? {
                  "type": "box",
                  "layout": "vertical",
                  "contents": [
                    {
                      "type": "text",
                      "text": String(waitingNumbers[index]),
                      "size": "md",
                      "color": "#111111",
                      "align": "center",
                      "weight": "bold"
                    }
                  ],
                  "backgroundColor": "#fefbec",
                  "cornerRadius": "md",
                  "paddingAll": "sm"
                } : {
                  "type": "filler"
                };
              })
            }))
          },
          {
            "type": "text",
            "text": `合計: ${waitingNumbers.length}組`,
            "size": "sm",
            "color": "#555555",
            "margin": "lg",
            "align": "end"
          }
        ]
      }
    }
  };

  return [flexMessage];
}
export { getStatusMessage, getTicketMessage, getTicketConfirmationMessage, getWaitingTimeMessage, getHoursMessage, getHolidayMessage, getWaitingNumbersMessage };