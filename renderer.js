const { ipcRenderer } = require('electron');
const cytoscape = require('cytoscape');

let cy; // 전역 변수로 그래프 객체 선언

document.addEventListener('DOMContentLoaded', async () => {
    // 그래프 초기화
    cy = cytoscape({
        container: document.getElementById('cy'), // 그래프를 그릴 HTML 요소
        elements: [], // 초기에는 빈 상태
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': '#666',
                    'label': 'data(id)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                },
            },
            {
                selector: 'edge',
                style: {
                    'width': 3,
                    'line-color': '#ccc',
                },
            },
        ],
        layout: {
            name: 'grid',
        },
    });

    // 저장된 데이터 불러오기
    const cardData = await ipcRenderer.invoke('load-cards');
    if (cardData && cardData.length > 0) {
        updateGraph(cardData); // 그래프 갱신
    }

    // 저장 버튼 이벤트 리스너
    document.getElementById('saveButton').addEventListener('click', async () => {
        const newCard = { id: `Node${cy.nodes().length + 1}`, title: 'New Node', content: 'Node content' };
        await ipcRenderer.invoke('save-card', newCard);

        cy.add({ data: { id: newCard.id } }); // 그래프에 새로운 노드 추가
    });
});

// 그래프를 데이터로 갱신하는 함수
function updateGraph(data) {
    const elements = data.map((card) => ({ data: { id: card.id } }));
    cy.add(elements);
    cy.layout({ name: 'grid' }).run(); // 레이아웃 다시 실행
}

// 노드 클릭 이벤트
cy?.on('click', 'node', (event) => {
    const nodeId = event.target.data('id');
    console.log(`Node clicked: ${nodeId}`);
});
